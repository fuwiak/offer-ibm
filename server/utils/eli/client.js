/**
 * Klient ELI API (Europejski Identyfikator Prawodawstwa).
 *
 * Źródło danych: https://api.sejm.gov.pl/eli  — publiczne API Sejmu RP udostępniające
 * akty prawne z Dziennika Ustaw (DU) oraz Monitora Polskiego (MP).
 * Dokumentacja: https://api.sejm.gov.pl/eli_pl.html
 *
 * API nie wymaga tokenu/autoryzacji. Przy błędach HTTP klient zwraca puste wyniki
 * (nie rzuca wyjątków), aby nie blokować generacji odpowiedzi.
 */

const ELI_BASE_URL = (
  process.env.ELI_BASE_URL || "https://api.sejm.gov.pl/eli"
).replace(/\/+$/, "");

// Publiczna strona aktu (interfejs www) — używana jako link w źródłach.
const ELI_PUBLIC_BASE_URL = (
  process.env.ELI_PUBLIC_BASE_URL || "https://eli.gov.pl/eli"
).replace(/\/+$/, "");

const ELI_FETCH_RETRIES = Math.min(
  6,
  Math.max(1, parseInt(process.env.ELI_FETCH_RETRIES, 10) || 3)
);

const ELI_TIMEOUT_MS = Math.min(
  60000,
  Math.max(2000, parseInt(process.env.ELI_TIMEOUT_MS, 10) || 12000)
);

const ELI_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Surowy fetch z ELI API z ponawianiem i timeoutem. Nigdy nie rzuca wyjątku.
 * @param {string} path - np. "/acts" lub "/acts/DU/2020/1280"
 * @param {{ accept?: string, raw?: boolean }} [opts] - accept: nagłówek Accept,
 *   raw: true => zwraca surowy tekst zamiast JSON.
 * @returns {Promise<object|string|null>}
 */
async function _request(path, opts = {}) {
  const accept = opts.accept || "application/json";
  const url = `${ELI_BASE_URL}${path}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < ELI_FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(8000, 350 * 2 ** (attempt - 1));
      await sleep(delay);
      console.log("[ELI] retry", {
        path,
        attempt: attempt + 1,
        delayMs: delay,
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ELI_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: accept, "User-Agent": "offer-kp-eli" },
        signal: controller.signal,
      });
      lastStatus = res.status;
      if (!res.ok) {
        const retry = ELI_RETRY_STATUSES.has(res.status);
        console.warn("[ELI] HTTP error", {
          path,
          status: res.status,
          statusText: res.statusText,
          retry,
          attempt: attempt + 1,
        });
        if (retry && attempt < ELI_FETCH_RETRIES - 1) continue;
        return null;
      }
      if (opts.raw) return await res.text();
      return await res.json();
    } catch (err) {
      console.warn("[ELI] request failed:", err?.message || err, {
        path,
        attempt: attempt + 1,
      });
      if (attempt < ELI_FETCH_RETRIES - 1) continue;
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  console.warn("[ELI] exhausted retries", { path, lastStatus });
  return null;
}

function buildQuery(params = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

// ─── Endpointy listujące słowniki / wydawnictwa ────────────────────────────────

/** Lista dzienników (wydawnictw): DU, MP. GET /eli/acts */
async function listPublishers() {
  const data = await _request("/acts");
  return Array.isArray(data) ? data : [];
}

/** Informacje o wydawnictwie. GET /eli/acts/{publisher} */
async function getPublisher(publisher) {
  return await _request(`/acts/${encodeURIComponent(publisher)}`);
}

/** Lista aktów w roku. GET /eli/acts/{publisher}/{year} */
async function listActsByYear(publisher, year) {
  return await _request(
    `/acts/${encodeURIComponent(publisher)}/${encodeURIComponent(year)}`
  );
}

/** Lista aktów w dzienniku. GET /eli/acts/{publisher}/{year}/volumes/{volume} */
async function listActsByVolume(publisher, year, volume) {
  return await _request(
    `/acts/${encodeURIComponent(publisher)}/${encodeURIComponent(
      year
    )}/volumes/${encodeURIComponent(volume)}`
  );
}

// ─── Wyszukiwanie i szczegóły aktów ────────────────────────────────────────────

/**
 * Wyszukiwanie aktów. GET /eli/acts/search
 * @param {object} params - dowolne parametry zapytania ELI: title, publisher, year,
 *   type, keyword, inForce, dateFrom, dateTo, limit, offset, sortBy, sortDir, ...
 * @returns {Promise<{ items: object[], totalCount: number, count: number, offset: number }>}
 */
async function search(params = {}) {
  const data = await _request(`/acts/search${buildQuery(params)}`);
  if (!data || typeof data !== "object")
    return { items: [], totalCount: 0, count: 0, offset: 0 };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    totalCount: data.totalCount ?? 0,
    count: data.count ?? 0,
    offset: data.offset ?? 0,
    searchQuery: data.searchQuery,
  };
}

/** Szczegóły aktu. GET /eli/acts/{publisher}/{year}/{num} */
async function getActDetails(publisher, year, num) {
  return await _request(
    `/acts/${encodeURIComponent(publisher)}/${encodeURIComponent(
      year
    )}/${encodeURIComponent(num)}`
  );
}

/** Szczegóły aktu wg adresu publikacyjnego (ISAP). GET /eli/acts/{address} */
async function getActByAddress(address) {
  return await _request(`/acts/${encodeURIComponent(address)}`);
}

/** Struktura aktu. GET /eli/acts/{publisher}/{year}/{num}/struct */
async function getActStruct(publisher, year, num) {
  const data = await _request(
    `/acts/${encodeURIComponent(publisher)}/${encodeURIComponent(
      year
    )}/${encodeURIComponent(num)}/struct`
  );
  return Array.isArray(data) ? data : [];
}

/** Odwołania do aktu. GET /eli/acts/{publisher}/{year}/{num}/references */
async function getActReferences(publisher, year, num) {
  const data = await _request(
    `/acts/${encodeURIComponent(publisher)}/${encodeURIComponent(
      year
    )}/${encodeURIComponent(num)}/references`
  );
  return Array.isArray(data) ? data : [];
}

/**
 * Tekst aktu w formacie HTML. GET /eli/acts/{publisher}/{year}/{num}/text.html
 * Zwraca surowy HTML (string) lub null.
 */
async function getActTextHtml(publisher, year, num) {
  return await _request(
    `/acts/${encodeURIComponent(publisher)}/${encodeURIComponent(
      year
    )}/${encodeURIComponent(num)}/text.html`,
    { accept: "text/html", raw: true }
  );
}

/**
 * Adres URL do pobrania tekstu aktu w formacie PDF.
 * (Plik binarny — zwracamy gotowy URL, a nie zawartość.)
 */
function actTextPdfUrl(publisher, year, num) {
  return `${ELI_BASE_URL}/acts/${encodeURIComponent(
    publisher
  )}/${encodeURIComponent(year)}/${encodeURIComponent(num)}/text.pdf`;
}

// ─── Słowniki referencyjne ─────────────────────────────────────────────────────

/** Lista statusów. GET /eli/statuses */
async function listStatuses() {
  const data = await _request("/statuses");
  return Array.isArray(data) ? data : [];
}

/** Lista rodzajów odwołań. GET /eli/references */
async function listReferenceTypes() {
  const data = await _request("/references");
  return Array.isArray(data) ? data : [];
}

/** Lista typów dokumentów. GET /eli/types */
async function listTypes() {
  const data = await _request("/types");
  return Array.isArray(data) ? data : [];
}

/** Lista słów kluczowych. GET /eli/keywords */
async function listKeywords() {
  const data = await _request("/keywords");
  return Array.isArray(data) ? data : [];
}

/** Lista instytucji. GET /eli/institutions */
async function listInstitutions() {
  const data = await _request("/institutions");
  return Array.isArray(data) ? data : [];
}

/**
 * Lista aktów zmienionych od podanej daty. GET /eli/changes/acts?since=...
 * @param {string} since - format yyyy-MM-ddTHH:mm:ss
 */
async function getChangedActs(since) {
  return await _request(`/changes/acts${buildQuery({ since })}`);
}

/**
 * Buduje publiczny adres URL strony aktu (interfejs www eli.gov.pl)
 * na podstawie identyfikatora ELI, np. "DU/2020/685" → https://eli.gov.pl/eli/DU/2020/685
 * @param {string} eli
 * @returns {string}
 */
function publicActUrl(eli) {
  const id = String(eli || "").replace(/^\/+|\/+$/g, "");
  return `${ELI_PUBLIC_BASE_URL}/${id}`;
}

module.exports = {
  ELI_BASE_URL,
  ELI_PUBLIC_BASE_URL,
  listPublishers,
  getPublisher,
  listActsByYear,
  listActsByVolume,
  search,
  getActDetails,
  getActByAddress,
  getActStruct,
  getActReferences,
  getActTextHtml,
  actTextPdfUrl,
  listStatuses,
  listReferenceTypes,
  listTypes,
  listKeywords,
  listInstitutions,
  getChangedActs,
  publicActUrl,
};
