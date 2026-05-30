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
  timeoutMs,
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

  const shopMs =
    parseInt(process.env.SHOP_DB_ENRICH_TIMEOUT_MS, 10) || 15000;
  const effectiveTimeout =
    timeoutMs ?? Math.min(120000, Math.max(8000, shopMs + 5000));

  const result = await Promise.race([
    shopFn(message, { workspace, maxDocs: 5, chatHistory }).then((r) => ({
      kind: "shopdb",
      contextTexts: r?.contextTexts || [],
      sources: r?.sources || [],
      flags: r?.flags,
    })),
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            kind: "shopdb",
            contextTexts: [],
            sources: [],
            flags: { shopDbTimeout: true },
          }),
        effectiveTimeout
      )
    ),
  ]).catch((err) => {
    console.warn("[ShopDB] enrich failed:", err?.message || err);
    return { kind: "shopdb", contextTexts: [], sources: [] };
  });

  return [result];
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
