const fs = require("fs");
const path = require("path");
const defaults = require("./offerKp.llm.defaults");
const {
  applyOpenRouterEnvAliases,
  resolveOpenRouterApiKey,
} = require("../utils/offerKpApp/openRouterEnv");

const ENV_KEYS = Object.keys(defaults).filter((k) => !k.startsWith("OFFER_KP_"));

function envIsSet(key) {
  const v = process.env[key];
  return v != null && String(v).trim() !== "";
}

function applyOfferKpLlmDefaults() {
  applyOpenRouterEnvAliases();

  process.env.LLM_PROVIDER = "openrouter";
  if (!envIsSet("OPENROUTER_MODEL_PREF")) {
    process.env.OPENROUTER_MODEL_PREF = defaults.OPENROUTER_MODEL_PREF;
  }

  if (!resolveOpenRouterApiKey()) {
    for (const key of ENV_KEYS) {
      if (envIsSet(key)) continue;
      const value = defaults[key];
      if (value == null || value === "") continue;
      process.env[key] = String(value);
    }
  }

  applyOpenRouterEnvAliases();
}

function syncOfferKpEnvFile(envPath = path.resolve(__dirname, "../.env")) {
  if (!fs.existsSync(envPath)) return;

  let content = fs.readFileSync(envPath, "utf8");
  for (const key of ENV_KEYS) {
    if (envIsSet(key) && key !== "OPENROUTER_MODEL_PREF" && key !== "LLM_PROVIDER")
      continue;
    const value = process.env[key] ?? defaults[key];
    if (value == null || value === "") continue;
    const line = `${key}='${value}'`;
    const re = new RegExp(`^${key}=.*$`, "m");
    content = re.test(content)
      ? content.replace(re, line)
      : `${content.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(envPath, content);
}

if (require.main === module) {
  applyOfferKpLlmDefaults();
  syncOfferKpEnvFile();
  console.log(
    `\x1b[32m[OFFER_KP-LLM]\x1b[0m provider=${process.env.LLM_PROVIDER} model=${process.env.OPENROUTER_MODEL_PREF}`
  );
}

module.exports = { applyOfferKpLlmDefaults, syncOfferKpEnvFile, defaults };
