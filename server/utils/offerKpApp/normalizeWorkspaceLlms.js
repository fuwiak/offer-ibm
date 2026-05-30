const prisma = require("../prisma");
const { resolveOpenRouterApiKey } = require("./openRouterEnv");
const llmDefaults = require("../../config/offerKp.llm.defaults");

/**
 * Ensures all workspaces use OpenRouter (existing DB rows included).
 */
async function normalizeOfferKpWorkspaceLlms() {
  if (!resolveOpenRouterApiKey()) return;

  const defaultModel =
    process.env.OPENROUTER_MODEL_PREF ||
    llmDefaults.OPENROUTER_MODEL_PREF ||
    "openrouter/auto";
  const workspaces = await prisma.workspaces.findMany({
    select: { id: true, chatProvider: true, agentProvider: true },
  });

  for (const ws of workspaces) {
    if (ws.chatProvider === "openrouter" && ws.agentProvider === "openrouter") {
      continue;
    }
    await prisma.workspaces.update({
      where: { id: ws.id },
      data: {
        chatProvider: "openrouter",
        agentProvider: "openrouter",
        chatModel: defaultModel,
        agentModel: defaultModel,
      },
    });
  }
}

module.exports = { normalizeOfferKpWorkspaceLlms };
