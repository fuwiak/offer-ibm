const { OpenAI } = require("openai");
const {
  resolveOpenRouterApiKey,
  resolveOpenRouterBaseUrl,
  resolveOpenRouterHeaders,
} = require("./openRouterEnv");
const llmDefaults = require("../../config/offerKp.llm.defaults");

function getAnthropicLlmClient() {
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) return null;
  return {
    client: new OpenAI({
      baseURL: resolveOpenRouterBaseUrl(),
      apiKey,
      defaultHeaders: resolveOpenRouterHeaders(),
      maxRetries: 1,
    }),
    model:
      process.env.OPENROUTER_MODEL_PREF ||
      llmDefaults.OPENROUTER_MODEL_PREF ||
      "openrouter/auto",
  };
}

async function anthropicTextCompletion({
  client,
  model,
  prompt,
  maxTokens = 4096,
}) {
  const completion = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });
  return completion?.choices?.[0]?.message?.content || "";
}

module.exports = { getAnthropicLlmClient, anthropicTextCompletion };
