function envEnabled(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || String(value).trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

async function load(modulePath, fnName) {
  try {
    const mod = require(modulePath);
    return typeof mod?.[fnName] === "function" ? mod[fnName] : null;
  } catch {
    return null;
  }
}

async function applyPostProcessingPipeline({ text, context = {} }) {
  let output = text;
  if (!output) return output;

  const yandexEnabled =
    envEnabled("YANDEX_FACT_CHECK_ENABLED") && !envEnabled("YANDEX_FACT_CHECK_DISABLED");
  const openRouterEnabled =
    envEnabled("OPENROUTER_FACT_CHECK_ENABLED") &&
    !envEnabled("OPENROUTER_FACT_CHECK_DISABLED");
  const polishEnabled = !envEnabled("RUSSIAN_STYLE_POLISH_DISABLED");

  if (yandexEnabled) {
    const fn = await load("../server/utils/chats/yandexFactCheck", "applyYandexFactCheck");
    if (fn) output = await fn(output, context?.contextTexts || []);
  }

  if (openRouterEnabled) {
    const fn = await load(
      "../server/utils/chats/openRouterGarantFactCheck",
      "applyOpenRouterGarantFactCheck"
    );
    if (fn) output = await fn(output, context?.contextTexts || []);
  }

  if (polishEnabled) {
    const fn = await load(
      "../server/utils/chats/russianStylePolish",
      "applyRussianStylePolish"
    );
    if (fn) output = await fn(output);
  }

  return output;
}

module.exports = { applyPostProcessingPipeline };
