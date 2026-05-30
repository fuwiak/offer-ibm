async function load(modulePath, fnName) {
  try {
    const mod = require(modulePath);
    return typeof mod?.[fnName] === "function" ? mod[fnName] : null;
  } catch {
    return null;
  }
}

async function collectExternalContexts({
  message,
  workspace,
  timeoutMs: _timeoutMs,
  chatHistory = null,
}) {
  const shopFn = await load(
    "../server/utils/offerKp/enrich",
    "getShopDbContext"
  );
  const shopEnabled = await load(
    "../server/utils/offerKp/enrich",
    "shopDbEnrichEnabled"
  );

  if (!shopFn || !shopEnabled?.()) {
    return [];
  }

  try {
    const r = await shopFn(message, { workspace, maxDocs: 5, chatHistory });
    return [
      {
        kind: "shopdb",
        contextTexts: r?.contextTexts || [],
        sources: r?.sources || [],
        flags: r?.flags,
      },
    ];
  } catch (err) {
    console.warn("[ShopDB] enrich failed:", err?.message || err);
    return [
      {
        kind: "shopdb",
        contextTexts: [],
        sources: [],
        flags: { shopDbError: true },
      },
    ];
  }
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
