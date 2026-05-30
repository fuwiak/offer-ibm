const { collectExternalContexts, dedupeSources } = require("./sourceEnrichers");
const { applyPostProcessingPipeline } = require("./postProcessing");
const { startKeepAlive } = require("./sseProtocol");
const { buildExternalLinksSection } = require("./externalLinksSection");

async function runGenerationPipeline({
  response,
  message,
  workspace,
  initialText,
  contextTexts = [],
  sources = [],
  externalContexts = null,
  metrics = {},
}) {
  const collectedExternalContexts = Array.isArray(externalContexts)
    ? externalContexts
    : await collectExternalContexts({ message, workspace });
  let mergedSources = [...sources];
  let mergedContext = [...contextTexts];
  for (const ext of collectedExternalContexts) {
    if (Array.isArray(ext?.contextTexts)) mergedContext.push(...ext.contextTexts);
    if (Array.isArray(ext?.sources)) mergedSources.push(...ext.sources);
  }
  mergedSources = dedupeSources(mergedSources);

  const keepalive = startKeepAlive(response);
  let finalText = initialText;
  try {
    finalText = await applyPostProcessingPipeline({
      text: finalText,
      context: { contextTexts: mergedContext, sources: mergedSources, metrics },
    });
  } finally {
    clearInterval(keepalive);
  }

  finalText += buildExternalLinksSection(mergedSources);
  return {
    text: finalText,
    contextTexts: mergedContext,
    sources: mergedSources,
    metrics,
    externalContexts: collectedExternalContexts,
  };
}

module.exports = { runGenerationPipeline };
