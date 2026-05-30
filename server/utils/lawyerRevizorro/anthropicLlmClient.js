const { OpenAI } = require("openai");
const { resolveOpenRouterApiKey } = require("./openRouterEnv");
const llmDefaults = require("../../config/lawyerRevizorro.llm.defaults");

function getAnthropicLlmClient() {
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) return null;
  return {
    client: new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://lawyerRevizorro.com",
        "X-Title": "lawyer-revizorro",
      },
      maxRetries: 1,
    }),
    model:
      process.env.OPENROUTER_MODEL_PREF ||
      llmDefaults.OPENROUTER_MODEL_PREF ||
      "openrouter/auto",
  };
}

async function anthropicTextCompletion({ client, model, prompt, maxTokens = 4096 }) {
  const completion = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });
  return completion?.choices?.[0]?.message?.content || "";
}

module.exports = { getAnthropicLlmClient, anthropicTextCompletion };
