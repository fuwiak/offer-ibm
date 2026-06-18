const prisma = require("../prisma");
const llmDefaults = require("../../config/offerKp.llm.defaults");
const { OFFER_KP_DEFAULT_MODEL } = require("../../config/offerKp.models");

/**
 * Ensures all workspaces use Ollama + allowed local models.
 */
async function normalizeOfferKpWorkspaceLlms() {
  const defaultModel =
    process.env.OLLAMA_MODEL_PREF ||
    llmDefaults.OLLAMA_MODEL_PREF ||
    OFFER_KP_DEFAULT_MODEL;
  const workspaces = await prisma.workspaces.findMany({
    select: { id: true, chatProvider: true, agentProvider: true },
  });

  for (const ws of workspaces) {
    if (ws.chatProvider === "ollama" && ws.agentProvider === "ollama") {
      continue;
    }
    await prisma.workspaces.update({
      where: { id: ws.id },
      data: {
        chatProvider: "ollama",
        agentProvider: "ollama",
        chatModel: defaultModel,
        agentModel: defaultModel,
      },
    });
  }
}

module.exports = { normalizeOfferKpWorkspaceLlms };
