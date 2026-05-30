async function load(modulePath, fnName) {
  try {
    const mod = require(modulePath);
    return typeof mod?.[fnName] === "function" ? mod[fnName] : null;
  } catch {
    return null;
  }
}

async function collectExternalContexts({ message, workspace, timeoutMs }) {
  const garantMs = parseInt(process.env.GARANT_ENRICH_TIMEOUT_MS, 10) || 45000;
  const effectiveTimeout = timeoutMs ?? Math.min(120000, Math.max(8000, garantMs + 5000));
  const tasks = [];
  const addTask = (kind, fn, fnOptions = {}) => {
    tasks.push(
      Promise.race([
        fn(message, { workspace, ...fnOptions }).then((result) => ({
          kind,
          contextTexts: result?.contextTexts || [],
          sources: result?.sources || [],
          flags: result?.flags,
        })),
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                kind,
                contextTexts: [],
                sources: [],
                flags: { [`${kind}Timeout`]: true },
              }),
            effectiveTimeout
          )
        ),
      ]).catch((err) => {
        console.warn(`[${kind}] enrich failed:`, err?.message || err);
        return { kind, contextTexts: [], sources: [] };
      })
    );
  };

  const shopFn = await load("../server/utils/offerKp/enrich", "getShopDbContext");
  const shopEnabled = await load(
    "../server/utils/offerKp/enrich",
    "shopDbEnrichEnabled"
  );
  if (shopFn && shopEnabled?.()) {
    addTask("shopdb", shopFn, { maxDocs: 3 });
  } else if ((process.env.GARANT_TOKEN || "").trim()) {
    const fn = await load("../server/utils/garant/enrich", "getGarantContext");
    if (fn) {
      addTask("garant", fn, {
        maxDocs: 3,
        includeSutyazhnik: true,
        sutyazhnikCount: 5,
      });
    }
  }
  if (process.env.YANDEX_SEARCH_API_KEY) {
    const fn = await load(
      "../server/utils/yandexSearch/enrich",
      "getYandexSearchContext"
    );
    if (fn) addTask("yandex", fn);
  }
  if (process.env.GOOGLE_CUSTOM_SEARCH_API_KEY) {
    const fn = await load(
      "../server/utils/googleCustomSearch/enrich",
      "getGoogleSearchContext"
    );
    if (fn) addTask("google", fn);
  }

  if (!tasks.length) return [];
  return Promise.all(tasks);
}

function dedupeSources(sources = []) {
  const seen = new Set();
  const result = [];
  for (const src of sources) {
    const key = src?.id || src?.url || src?.title || JSON.stringify(src);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(src);
  }
  return result;
}

module.exports = {
  collectExternalContexts,
  dedupeSources,
};
