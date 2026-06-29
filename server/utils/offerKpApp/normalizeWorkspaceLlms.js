const prisma = require("../prisma");
const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  isOfferKpCloudModel,
  isOfferKpAllowedModel,
} = require("../../config/offerKp.models");
const { coerceToLocalModel } = require("./resolveLlmProvider");

/**
 * Migrates all workspaces to LM Studio + local model ids.
 */
async function normalizeOfferKpWorkspaceLlms() {
  const defaultModel = coerceToLocalModel(
    process.env.LMSTUDIO_MODEL_PREF ||
      llmDefaults.LMSTUDIO_MODEL_PREF ||
      OFFER_KP_DEFAULT_MODEL
  );

  const workspaces = await prisma.workspaces.findMany({
    select: {
      id: true,
      slug: true,
      chatProvider: true,
      agentProvider: true,
      chatModel: true,
      agentModel: true,
    },
  });

  for (const ws of workspaces) {
    const chatModel = coerceToLocalModel(ws.chatModel || defaultModel);
    const agentModel = coerceToLocalModel(
      ws.agentModel || ws.chatModel || defaultModel
    );

    const needsFix =
      ws.chatProvider !== "lmstudio" ||
      ws.agentProvider !== "lmstudio" ||
      ws.chatModel !== chatModel ||
      ws.agentModel !== agentModel ||
      isOfferKpCloudModel(ws.chatModel) ||
      isOfferKpCloudModel(ws.agentModel) ||
      !isOfferKpAllowedModel(chatModel) ||
      !isOfferKpAllowedModel(agentModel) ||
      ws.chatProvider === "ollama" ||
      ws.agentProvider === "ollama";

    if (!needsFix) continue;

    await prisma.workspaces.update({
      where: { id: ws.id },
      data: {
        chatProvider: "lmstudio",
        agentProvider: "lmstudio",
        chatModel,
        agentModel,
      },
    });
    console.log(
      `[OFFER_KP-LLM] workspace ${ws.slug} → lmstudio / ${chatModel}`
    );
  }
}

module.exports = { normalizeOfferKpWorkspaceLlms };
