/**
 * Обогащение RAG-контекста результатами поиска ГАРАНТ: нормы и опционально судебная практика.
 * Возвращает contextTexts и sources в формате apiChatHandler / Citation UI.
 */

const { v4: uuidv4 } = require("uuid");
const garant = require("./client");

const GARANT_DOC_BASE = "https://d.garant.ru";
const MAX_EXCERPT_CHARS = 2800;

const GARANT_ENRICH_TIMEOUT_MS = Math.min(
  Math.max(3000, parseInt(process.env.GARANT_ENRICH_TIMEOUT_MS, 10) || 45000),
  120000
);

const GARANT_TOPIC_CONCURRENCY = Math.min(
  8,
  Math.max(1, parseInt(process.env.GARANT_TOPIC_CONCURRENCY, 10) || 2)
);

const GARANT_TOPIC_BATCH_GAP_MS = (() => {
  const v = parseInt(process.env.GARANT_TOPIC_BATCH_GAP_MS || "", 10);
  if (!Number.isFinite(v)) return 200;
  return Math.min(3000, Math.max(0, v));
})();

const DEFAULT_GARANT_MAX_TOPIC_LOOKUPS = 18;
const GARANT_AS_OF_YEAR = 2026;

// Blend weights for the final top-N ranking: relevance (search rank) vs recency
// (document date). Tunable via env; defaults favour relevance but keep recency
// meaningful so the freshest of the relevant documents bubble up.
const GARANT_RELEVANCE_WEIGHT = (() => {
  const v = parseFloat(process.env.GARANT_RELEVANCE_WEIGHT);
  return Number.isFinite(v) && v >= 0 ? v : 0.6;
})();
const GARANT_RECENCY_WEIGHT = (() => {
  const v = parseFloat(process.env.GARANT_RECENCY_WEIGHT);
  return Number.isFinite(v) && v >= 0 ? v : 0.4;
})();

function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptFromSearchDocument(doc) {
  if (!doc || typeof doc !== "object") return "";
  const tryKeys = [
    "fragment",
    "snippet",
    "text",
    "highlight",
    "annotation",
    "description",
    "lead",
    "match",
  ];
  for (const k of tryKeys) {
    const v = doc[k];
    if (typeof v === "string" && v.trim()) return htmlToPlainText(v);
    if (Array.isArray(v)) {
      const joined = v
        .filter((x) => typeof x === "string" && x.trim())
        .join(" ");
      if (joined.trim()) return htmlToPlainText(joined);
    }
  }
  return "";
}

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} batchSize
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapInBatches(items, batchSize, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const part = await Promise.all(batch.map((item, j) => fn(item, i + j)));
    out.push(...part);
    if (i + batchSize < items.length && GARANT_TOPIC_BATCH_GAP_MS > 0) {
      await new Promise((r) => setTimeout(r, GARANT_TOPIC_BATCH_GAP_MS));
    }
  }
  return out;
}

function onlyActiveDocsFromEnv() {
  const v = process.env.GARANT_ONLY_ACTIVE_DOCS;
  if (v === undefined || v === "") return true; // default: always filter for active docs
  const lower = String(v).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(lower)) return false;
  return true;
}

function parseGarantDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const iso = Date.parse(dateStr);
  if (!isNaN(iso)) return iso;
  // DD.MM.YYYY or D.M.YYYY
  const parts = dateStr.split(".");
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    if (y > 1000 && m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return new Date(y, m - 1, d).getTime();
  }
  return null;
}

function parseGarantDateArray(dateArr) {
  if (!Array.isArray(dateArr) || dateArr.length === 0) return null;
  const timestamps = dateArr.map(parseGarantDate).filter(Boolean);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
}

function isGarantStatusActive(status) {
  if (status == null) return false;
  const s = String(status).trim();
  if (!s) return false;
  return s === "Действующие" || /^действующ/i.test(s);
}

/** Best-effort "freshness" timestamp for a document from its topic info. */
function garantDocTimestamp(info) {
  return (
    parseGarantDate(info?.last_modified) ||
    parseGarantDateArray(info?.chdate) ||
    parseGarantDateArray(info?.date) ||
    0
  );
}

/**
 * Ranks candidates by a blend of relevance (search rank) and recency (date),
 * so the final selection contains the freshest of the most relevant documents.
 * @param {{doc: object, rank: number, ts: number}[]} candidates
 * @param {number} poolSize - size of the original (relevance-ordered) pool
 * @returns {{doc: object, rank: number, ts: number, score: number}[]}
 */
function rankByRelevanceAndRecency(candidates, poolSize) {
  const times = candidates.map((c) => c.ts).filter(Boolean);
  const minT = times.length ? Math.min(...times) : 0;
  const maxT = times.length ? Math.max(...times) : 0;
  const span = maxT - minT;
  const wRel = GARANT_RELEVANCE_WEIGHT;
  const wRec = GARANT_RECENCY_WEIGHT;
  const wSum = wRel + wRec || 1;

  return candidates
    .map((c) => {
      // relevance: earlier search rank → closer to 1
      const rel = poolSize > 1 ? 1 - c.rank / (poolSize - 1) : 1;
      // recency: newest date → closer to 1 (0 when no/unknown date)
      const rec = c.ts ? (span > 0 ? (c.ts - minT) / span : 1) : 0;
      const score = (wRel * rel + wRec * rec) / wSum;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}

async function pickActiveDocuments(documents, maxDocs, maxLookups) {
  const pool = (documents || []).slice(0, maxLookups);
  if (pool.length === 0)
    return {
      documents: [],
      unresolvedTopicStatus: false,
      usedNewestFallback: false,
    };
  const infos = await mapInBatches(pool, GARANT_TOPIC_CONCURRENCY, (doc) =>
    garant.getTopicInfo(doc.topic).catch(() => null)
  );
  const activeCandidates = []; // { doc, rank, ts } — status «Действующие»
  const resolvedCandidates = []; // docs where we got topic info (active or not)
  let infoFailures = 0;
  for (let i = 0; i < pool.length; i++) {
    const info = infos[i];
    if (!info) {
      infoFailures++;
      continue;
    }
    const ts = garantDocTimestamp(info);
    resolvedCandidates.push({ doc: pool[i], info, ts });
    if (isGarantStatusActive(info.status))
      activeCandidates.push({ doc: pool[i], rank: i, ts });
  }
  // All topic API calls failed — graceful degradation, status unknown
  if (
    activeCandidates.length === 0 &&
    infoFailures === pool.length &&
    pool.length > 0
  ) {
    console.warn(
      "[Garant] все GET /topic для фильтра «Действующие» недоступны; берём топ результатов поиска без проверки статуса."
    );
    return {
      documents: pool.slice(0, maxDocs),
      unresolvedTopicStatus: true,
      usedNewestFallback: false,
    };
  }
  // Resolved statuses but nothing active — DO NOT inject random "freshest"
  // documents. Better to return nothing relevant and let the caller say so.
  if (activeCandidates.length === 0 && resolvedCandidates.length > 0) {
    console.warn(
      "[Garant] действующих документов по запросу не найдено; релевантных результатов нет."
    );
    return {
      documents: [],
      unresolvedTopicStatus: false,
      usedNewestFallback: false,
      noActiveFound: true,
    };
  }
  // Top-N active docs ranked by relevance blended with recency (freshest-relevant first).
  const ranked = rankByRelevanceAndRecency(activeCandidates, pool.length);
  return {
    documents: ranked.slice(0, maxDocs).map((c) => c.doc),
    unresolvedTopicStatus: false,
    usedNewestFallback: false,
  };
}

function isSutyazhnikEnabledInEnv() {
  const v = (process.env.GARANT_SUTYAZHNIK || "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
}

/**
 * @param {string} message
 * @param {{ maxDocs?: number, includeSutyazhnik?: boolean, sutyazhnikCount?: number, onlyActiveDocs?: boolean, maxTopicLookups?: number }} options
 * @returns {Promise<{ contextTexts: string[], sources: object[], flags?: object }>}
 */
async function getGarantContext(message, options = {}) {
  const {
    maxDocs = 5,
    includeSutyazhnik = false,
    sutyazhnikCount = 5,
    onlyActiveDocs = onlyActiveDocsFromEnv(),
    maxTopicLookups = Math.min(
      50,
      Math.max(
        1,
        parseInt(process.env.GARANT_MAX_TOPIC_LOOKUPS, 10) ||
          DEFAULT_GARANT_MAX_TOPIC_LOOKUPS
      )
    ),
  } = options;

  const contextTexts = [];
  const sources = [];

  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      contextTexts,
      sources,
      flags: {
        garantSkippedEmptyMessage: true,
        garantSearchHitCount: 0,
        garantDocCount: 0,
        onlyActiveDocsMode: onlyActiveDocsFromEnv(),
        unresolvedTopicStatus: false,
        activeDocFilterFallback: false,
        garantTimeout: false,
      },
    };
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("GARANT_TIMEOUT")),
      GARANT_ENRICH_TIMEOUT_MS
    )
  );

  const runEnrich = async () => {
    console.log("[Garant] enrich start", {
      messageLen: message.length,
      maxDocs,
      includeSutyazhnik,
      timeoutMs: GARANT_ENRICH_TIMEOUT_MS,
    });

    const searchResult = await garant.search(message, {
      page: 1,
      env: "internet",
      sort: 0,
      sortOrder: 0,
    });

    const searchHitCount = (searchResult.documents || []).length;
    let unresolvedTopicStatus = false;
    const activeDocFilterFallback = false;

    let contextGarantTag = onlyActiveDocs
      ? `[ГАРАНТ · карточка API: «Действующие» · ${GARANT_AS_OF_YEAR} г.]`
      : "[ГАРАНТ]";

    let docs = searchResult.documents || [];
    let noActiveFound = false;
    if (onlyActiveDocs) {
      const pick = await pickActiveDocuments(docs, maxDocs, maxTopicLookups);
      docs = pick.documents;
      unresolvedTopicStatus = pick.unresolvedTopicStatus;
      noActiveFound = !!pick.noActiveFound;
      if (pick.unresolvedTopicStatus) {
        // API outage: keep the most relevant hits but flag status as unconfirmed.
        contextGarantTag = `[ГАРАНТ · статус не подтверждён (ошибки/лимит GET /topic); сверьте карточку в ГАРАНТ · ${GARANT_AS_OF_YEAR} г.]`;
      }
      // NB: when no active documents are found we intentionally return NOTHING
      // (docs stays []). We do not inject random "freshest" or unverified docs —
      // the caller will state that no relevant sources were found.
    } else {
      docs = docs.slice(0, maxDocs);
    }

    const htmlResults = await mapInBatches(
      docs,
      GARANT_TOPIC_CONCURRENCY,
      (doc) => garant.getTopicHtml(doc.topic).catch(() => ({ items: [] }))
    );

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const topic = doc.topic;
      const name = doc.name || `Документ ГАРАНТ ${topic}`;
      const relativeUrl = doc.url || `/#/document/${topic}`;
      const absoluteUrl = relativeUrl.startsWith("http")
        ? relativeUrl
        : GARANT_DOC_BASE + relativeUrl;

      const fromSearch = excerptFromSearchDocument(doc);
      let excerpt = fromSearch || name;
      const htmlResult = htmlResults[i];
      if (htmlResult?.items?.length > 0) {
        const firstItem = htmlResult.items[0];
        const firstPageText = firstItem.text || firstItem["text"] || "";
        const plain = htmlToPlainText(firstPageText);
        if (plain.length > 0) {
          excerpt =
            plain.length > MAX_EXCERPT_CHARS
              ? plain.slice(0, MAX_EXCERPT_CHARS) + "..."
              : plain;
        }
      } else if (fromSearch.length > MAX_EXCERPT_CHARS) {
        excerpt = fromSearch.slice(0, MAX_EXCERPT_CHARS) + "...";
      }

      const id = `garant-${topic}-${i}-${uuidv4().slice(0, 8)}`;
      const chunkSource = `link://${absoluteUrl}`;

      contextTexts.push(
        `${contextGarantTag} ${name}\nСсылка: ${absoluteUrl}\n${excerpt}`
      );
      sources.push({
        id,
        title: name,
        text: excerpt.slice(0, 1000) + (excerpt.length > 1000 ? "..." : ""),
        chunkSource,
        url: absoluteUrl,
        docSource: "ГАРАНТ",
        score: 1,
        garantTopic: topic,
        garantKind: "norm",
      });
    }

    if (
      includeSutyazhnik &&
      isSutyazhnikEnabledInEnv() &&
      sutyazhnikCount > 0
    ) {
      try {
        const sutyazhnik = await garant.sutyazhnikSearch(message, {
          count: Math.min(sutyazhnikCount, 10),
          kind: ["301", "302"],
        });
        const practiceDocs = (sutyazhnik.documents || []).slice(0, 2);
        for (let p = 0; p < practiceDocs.length; p++) {
          const pd = practiceDocs[p];
          const courts = pd.courts || [];
          const court = courts[0] || courts[1];
          if (!court) continue;
          const topic = court.topic;
          const name = court.name || `Судебная практика ГАРАНТ ${topic}`;
          const url = court.url || `/#/document/${topic}`;
          const absoluteUrl = url.startsWith("http")
            ? url
            : `https://d.garant.ru${url}`;
          const id = `garant-sutyazhnik-${topic}-${p}-${uuidv4().slice(0, 8)}`;
          contextTexts.push(
            `[ГАРАНТ — судебная практика] ${name}\nСсылка: ${absoluteUrl}`
          );
          sources.push({
            id,
            title: name,
            text: name,
            chunkSource: `link://${absoluteUrl}`,
            url: absoluteUrl,
            docSource: "ГАРАНТ",
            score: 1,
            garantTopic: topic,
            garantKind: "court",
          });
        }
      } catch {
        // ignore sutyazhnik errors
      }
    }

    console.log("[Garant] enrich done", {
      contextChunks: contextTexts.length,
      sourcesCount: sources.length,
    });
    return {
      contextTexts,
      sources,
      flags: {
        garantSearchHitCount: searchHitCount,
        garantDocCount: docs.length,
        onlyActiveDocsMode: onlyActiveDocs,
        unresolvedTopicStatus,
        activeDocFilterFallback,
        noActiveFound,
        usedNewestFallback: false,
        garantTimeout: false,
      },
    };
  };

  try {
    return await Promise.race([runEnrich(), timeoutPromise]);
  } catch (e) {
    if (e?.message === "GARANT_TIMEOUT") {
      console.warn("[Garant] enrich timeout, returning empty context", {
        timeoutMs: GARANT_ENRICH_TIMEOUT_MS,
      });
      return {
        contextTexts: [],
        sources: [],
        flags: {
          garantTimeout: true,
          garantSearchHitCount: 0,
          garantDocCount: 0,
          onlyActiveDocsMode: onlyActiveDocsFromEnv(),
          unresolvedTopicStatus: false,
          activeDocFilterFallback: false,
        },
      };
    }
    throw e;
  }
}

module.exports = {
  getGarantContext,
};
