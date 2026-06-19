const prisma = require("../prisma");
const llmDefaults = require("../../config/offerKp.llm.defaults");
const {
  OFFER_KP_DEFAULT_MODEL,
  resolveOfferKpModel,
  resolveOfferKpProvider,
  isOfferKpAllowedModel,
} = require("../../config/offerKp.models");

const ALLOWED_PROVIDERS = new Set(["lmstudio", "ollama"]);

/**
 * Ensures all workspaces use allowed OfferKP providers and models.
 */
async function normalizeOfferKpWorkspaceLlms() {
  const defaultModel = resolveOfferKpModel(
    process.env.LMSTUDIO_MODEL_PREF ||
      process.env.OLLAMA_MODEL_PREF ||
      llmDefaults.LMSTUDIO_MODEL_PREF ||
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
    const chatModel = resolveOfferKpModel(ws.chatModel || defaultModel);
    const agentModel = resolveOfferKpModel(
      ws.agentModel || ws.chatModel || defaultModel
    );
    const chatProvider = resolveOfferKpProvider(chatModel);
    const agentProvider = resolveOfferKpProvider(agentModel);

    const needsProviderFix =
      !ALLOWED_PROVIDERS.has(ws.chatProvider) ||
      !ALLOWED_PROVIDERS.has(ws.agentProvider) ||
      ws.chatProvider !== chatProvider ||
      ws.agentProvider !== agentProvider;
    const needsModelFix =
      !isOfferKpAllowedModel(ws.chatModel) ||
      !isOfferKpAllowedModel(ws.agentModel);

    if (!needsProviderFix && !needsModelFix) continue;

    await prisma.workspaces.update({
      where: { id: ws.id },
      data: {
        chatProvider,
        agentProvider,
        chatModel,
        agentModel,
      },
    });
  }
}

module.exports = { normalizeOfferKpWorkspaceLlms };
