/**
 * Wzbogacanie kontekstu RAG aktami prawnymi z ELI API (api.sejm.gov.pl).
 *
 * Dla języka polskiego pełni tę samą rolę co ГАРАНТ dla rosyjskiego: wyszukuje
 * relewantne akty (Dziennik Ustaw / Monitor Polski), pobiera metadane oraz —
 * gdy dostępny — fragment tekstu HTML, i zwraca contextTexts + sources w formacie
 * zgodnym z apiChatHandler / UI cytowań.
 *
 * Zwracane source mają docSource: "ELI", dzięki czemu blok źródeł na końcu
 * odpowiedzi (linksFooter) wyświetla osobną sekcję ELI.
 */

const { v4: uuidv4 } = require("uuid");
const eli = require("./client");

const MAX_EXCERPT_CHARS = 2600;
const SEARCH_LIMIT_PER_TERM = 15;

const ELI_ENRICH_TIMEOUT_MS = Math.min(
  120000,
  Math.max(4000, parseInt(process.env.ELI_ENRICH_TIMEOUT_MS, 10) || 40000)
);

const ELI_TEXT_CONCURRENCY = Math.min(
  6,
  Math.max(1, parseInt(process.env.ELI_TEXT_CONCURRENCY, 10) || 3)
);

// Słowa pomijane przy budowaniu zapytań (zbyt ogólne / funkcyjne).
const STOPWORDS = new Set([
  "ustawa",
  "ustawy",
  "ustawie",
  "ustawę",
  "ustawe",
  "ustawą",
  "ustawa",
  "prawo",
  "prawa",
  "prawie",
  "jaki",
  "jaka",
  "jakie",
  "jakich",
  "który",
  "ktory",
  "która",
  "ktora",
  "które",
  "ktore",
  "czym",
  "czy",
  "jest",
  "są",
  "sa",
  "być",
  "byc",
  "oraz",
  "lub",
  "albo",
  "dla",
  "przez",
  "przy",
  "pod",
  "nad",
  "się",
  "sie",
  "jak",
  "co",
  "to",
  "ten",
  "ta",
  "te",
  "tych",
  "tym",
  "tego",
  "oraz",
  "gdzie",
  "kiedy",
  "ile",
  "jakie",
  "proszę",
  "prosze",
  "chcę",
  "chce",
  "potrzebuję",
  "potrzebuje",
  "mam",
  "można",
  "mozna",
  "należy",
  "nalezy",
  "zgodnie",
  "według",
  "wedlug",
  "mnie",
  "mój",
  "moj",
  "moja",
  "moje",
  "informacja",
  "informacje",
  "pytanie",
  "pomoc",
  "witam",
  "dzień",
  "dzien",
  "dobry",
  "this",
  "that",
  "what",
  "which",
  "please",
  "about",
  "with",
  "from",
  "have",
  "does",
]);

function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Wyciąga znaczące słowa zapytania (rdzenie tematyczne) do wyszukania po `title`.
 * ELI API dopasowuje `title` jako ciągły fragment, dlatego najlepsze rezultaty
 * dają pojedyncze, treściwe słowa kluczowe.
 * @param {string} message
 * @returns {string[]}
 */
function extractSearchTerms(message) {
  const words = String(message || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  // Deduplikacja z zachowaniem kolejności; preferujemy dłuższe (bardziej
  // specyficzne) słowa, ale ograniczamy liczbę zapytań do API.
  const seen = new Set();
  const unique = [];
  for (const w of words) {
    if (seen.has(w)) continue;
    seen.add(w);
    unique.push(w);
  }
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 5);
}

async function mapInBatches(items, batchSize, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const part = await Promise.all(batch.map((item, j) => fn(item, i + j)));
    out.push(...part);
  }
  return out;
}

function actEli(act) {
  return act?.ELI || act?.address || "";
}

function parseActTimestamp(act) {
  const candidates = [
    act?.changeDate,
    act?.promulgation,
    act?.announcementDate,
  ];
  for (const c of candidates) {
    const t = Date.parse(c);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function onlyInForceFromEnv() {
  const v = process.env.ELI_ONLY_IN_FORCE;
  if (v === undefined || v === "") return true; // domyślnie: tylko obowiązujące
  const lower = String(v).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(lower)) return false;
  return true;
}

/**
 * Łączy wyniki wyszukiwań po pojedynczych słowach, ocenia trafność (ile słów
 * zapytania pojawia się w tytule) z premią za świeżość i zwraca top-N aktów.
 * @param {Map<string, object>} byEli
 * @param {string[]} terms
 * @param {number} maxDocs
 */
function rankActs(byEli, terms, maxDocs) {
  const acts = [...byEli.values()];
  if (acts.length === 0) return [];

  const times = acts.map(parseActTimestamp).filter(Boolean);
  const minT = times.length ? Math.min(...times) : 0;
  const maxT = times.length ? Math.max(...times) : 0;
  const span = maxT - minT;

  const scored = acts.map((act) => {
    const title = String(act?.title || "").toLowerCase();
    let termHits = 0;
    for (const t of terms) if (title.includes(t)) termHits++;
    const ts = parseActTimestamp(act);
    const recency = ts ? (span > 0 ? (ts - minT) / span : 1) : 0;
    // Trafność tematyczna dominuje, świeżość rozstrzyga remisy.
    const score = termHits * 10 + recency;
    return { act, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxDocs)
    .map((s) => s.act);
}

function buildExcerptFromMetadata(act) {
  const parts = [];
  if (act?.type) parts.push(act.type);
  if (act?.status) parts.push(`status: ${act.status}`);
  if (act?.announcementDate) parts.push(`wydano: ${act.announcementDate}`);
  if (act?.promulgation) parts.push(`ogłoszono: ${act.promulgation}`);
  if (act?.entryIntoForce) parts.push(`wejście w życie: ${act.entryIntoForce}`);
  const keywords = Array.isArray(act?.keywords)
    ? act.keywords.filter(Boolean)
    : [];
  if (keywords.length) parts.push(`słowa kluczowe: ${keywords.join(", ")}`);
  const releasedBy = Array.isArray(act?.releasedBy)
    ? act.releasedBy.filter(Boolean)
    : [];
  if (releasedBy.length) parts.push(`organ wydający: ${releasedBy.join(", ")}`);
  return parts.join(" · ");
}

/**
 * @param {string} message
 * @param {{ maxDocs?: number, onlyInForce?: boolean, fetchText?: boolean }} [options]
 * @returns {Promise<{ contextTexts: string[], sources: object[], flags: object }>}
 */
async function getEliContext(message, options = {}) {
  const {
    maxDocs = Math.min(
      10,
      Math.max(1, parseInt(process.env.ELI_MAX_DOCS, 10) || 5)
    ),
    onlyInForce = onlyInForceFromEnv(),
    fetchText = process.env.ELI_FETCH_TEXT !== "0",
  } = options;

  const contextTexts = [];
  const sources = [];

  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      contextTexts,
      sources,
      flags: {
        eliSkippedEmptyMessage: true,
        eliSearchHitCount: 0,
        eliDocCount: 0,
      },
    };
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("ELI_TIMEOUT")), ELI_ENRICH_TIMEOUT_MS)
  );

  const runEnrich = async () => {
    const terms = extractSearchTerms(message);
    console.log("[ELI] enrich start", {
      messageLen: message.length,
      terms,
      maxDocs,
      onlyInForce,
    });

    // Brak treściwych słów — spróbuj całej (przyciętej) frazy jako tytułu.
    const queries =
      terms.length > 0 ? terms : [String(message).trim().slice(0, 120)];

    const searchResults = await mapInBatches(queries, 3, (term) =>
      eli
        .search({
          title: term,
          ...(onlyInForce ? { inForce: 1 } : {}),
          limit: SEARCH_LIMIT_PER_TERM,
          sortBy: "date",
          sortDir: "desc",
        })
        .catch(() => ({ items: [], totalCount: 0 }))
    );

    const byEli = new Map();
    let searchHitCount = 0;
    for (const r of searchResults) {
      searchHitCount += r?.totalCount || 0;
      for (const act of r?.items || []) {
        const key = actEli(act);
        if (!key) continue;
        if (!byEli.has(key)) byEli.set(key, act);
      }
    }

    const topActs = rankActs(byEli, terms, maxDocs);

    // Pobierz fragment tekstu HTML dla aktów, które go udostępniają.
    const htmlByIndex = new Array(topActs.length).fill("");
    if (fetchText) {
      await mapInBatches(topActs, ELI_TEXT_CONCURRENCY, async (act, idx) => {
        if (!act?.textHTML) return;
        const [pub, year, num] = String(actEli(act)).split("/");
        if (!pub || !year || !num) return;
        const html = await eli.getActTextHtml(pub, year, num).catch(() => null);
        if (html) htmlByIndex[idx] = htmlToPlainText(html);
      });
    }

    for (let i = 0; i < topActs.length; i++) {
      const act = topActs[i];
      const id = `eli-${actEli(act).replace(/\//g, "-")}-${uuidv4().slice(0, 8)}`;
      const url = eli.publicActUrl(actEli(act));
      const title = act?.title || act?.displayAddress || `Akt ${actEli(act)}`;
      const displayAddress = act?.displayAddress || actEli(act);

      const meta = buildExcerptFromMetadata(act);
      const bodyText = htmlByIndex[i] || "";
      let excerpt = bodyText || meta || title;
      if (excerpt.length > MAX_EXCERPT_CHARS)
        excerpt = excerpt.slice(0, MAX_EXCERPT_CHARS) + "...";

      const statusTag = onlyInForce
        ? "[ELI · Dziennik Ustaw/Monitor Polski · obowiązujące]"
        : "[ELI · Dziennik Ustaw/Monitor Polski]";

      contextTexts.push(
        `${statusTag} ${title}\n${displayAddress}` +
          (meta ? `\n${meta}` : "") +
          `\nŹródło: ${url}\n${excerpt}`
      );

      sources.push({
        id,
        title: `${title} (${displayAddress})`,
        text: excerpt.slice(0, 1000) + (excerpt.length > 1000 ? "..." : ""),
        chunkSource: `link://${url}`,
        url,
        docSource: "ELI",
        score: 1,
        eliId: actEli(act),
        eliStatus: act?.status || null,
        eliType: act?.type || null,
        eliDisplayAddress: displayAddress,
      });
    }

    console.log("[ELI] enrich done", {
      terms: terms.length,
      candidates: byEli.size,
      contextChunks: contextTexts.length,
      sourcesCount: sources.length,
    });

    return {
      contextTexts,
      sources,
      flags: {
        eliSearchHitCount: searchHitCount,
        eliCandidateCount: byEli.size,
        eliDocCount: topActs.length,
        eliOnlyInForce: onlyInForce,
        eliTimeout: false,
      },
    };
  };

  try {
    return await Promise.race([runEnrich(), timeoutPromise]);
  } catch (e) {
    if (e?.message === "ELI_TIMEOUT") {
      console.warn("[ELI] enrich timeout, returning empty context", {
        timeoutMs: ELI_ENRICH_TIMEOUT_MS,
      });
      return {
        contextTexts: [],
        sources: [],
        flags: { eliTimeout: true, eliSearchHitCount: 0, eliDocCount: 0 },
      };
    }
    console.warn("[ELI] enrich error:", e?.message || e);
    return {
      contextTexts: [],
      sources: [],
      flags: { eliError: true, eliSearchHitCount: 0, eliDocCount: 0 },
    };
  }
}

module.exports = { getEliContext };
