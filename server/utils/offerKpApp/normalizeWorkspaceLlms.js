const prisma = require("../prisma");
const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
  isOfferKpAllowedModel,
} = require("../../config/offerKp.models");

/**
 * Ensures all workspaces use Ollama + allowed local models.
 */
async function normalizeOfferKpWorkspaceLlms() {
  const defaultModel = resolveOfferKpModel(
    process.env.OLLAMA_MODEL_PREF ||
      llmDefaults.OLLAMA_MODEL_PREF ||
      OFFER_KP_DEFAULT_MODEL
  );

  const workspaces = await prisma.workspaces.findMany({
    select: {
      id: true,
      chatProvider: true,
      agentProvider: true,
      chatModel: true,
      agentModel: true,
    },
  });

  for (const ws of workspaces) {
    const needsProviderFix =
      ws.chatProvider !== "ollama" || ws.agentProvider !== "ollama";
    const needsModelFix =
      !isOfferKpAllowedModel(ws.chatModel) ||
      !isOfferKpAllowedModel(ws.agentModel);

    if (!needsProviderFix && !needsModelFix) continue;

    await prisma.workspaces.update({
      where: { id: ws.id },
      data: {
        chatProvider: "ollama",
        agentProvider: "ollama",
        chatModel: resolveOfferKpModel(ws.chatModel || defaultModel),
        agentModel: resolveOfferKpModel(ws.agentModel || ws.chatModel || defaultModel),
      },
    });
  }
}

module.exports = { normalizeOfferKpWorkspaceLlms };
