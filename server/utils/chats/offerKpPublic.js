const { v4: uuidv4 } = require("uuid");
const { Workspace } = require("../../models/workspace");
const { getLLMProviderWithFallback } = require("../helpers");
const { chatPrompt } = require("./index");
const {
  writeResponseChunk,
  handleDefaultStreamResponseV2,
} = require("../helpers/chat/responses");
const { getShopDbContext, shopDbEnrichEnabled } = require("../offerKp/enrich");
const { applyExternalContextsForLlm } = require("../offerKp/catalogPrompt");
const { resolveOfferKpImmediateReply } = require("../offerKp/immediateReply");
const {
  renderGroundedCatalogResponse,
  sanitizeOfferKpHistory,
} = require("../offerKp/groundedResponse");
const {
  getPublicChatHistory,
  appendPublicChatMessage,
} = require("../offerKp/offerKpPublicSession");

async function streamOfferKpPublicChat(
  response,
  message,
  sessionId = "public",
  options = {}
) {
  const slug = process.env.OFFER_KP_PUBLIC_WORKSPACE || "offerKp-public";
  const workspace = await Workspace.get({ slug });

  if (!workspace) {
    writeResponseChunk(response, {
      id: uuidv4(),
      type: "abort",
      textResponse: `Public workspace "${slug}" not found. Create a workspace with this slug or set OFFER_KP_PUBLIC_WORKSPACE.`,
      sources: [],
      close: true,
      error: "workspace_not_found",
    });
    return;
  }

  const uuid = uuidv4();
  const immediateReply = shopDbEnrichEnabled()
    ? resolveOfferKpImmediateReply(message)
    : null;
  if (immediateReply) {
    appendPublicChatMessage(sessionId, "user", message);
    appendPublicChatMessage(sessionId, "assistant", immediateReply);
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse: immediateReply,
      sources: [],
      close: true,
      error: null,
      metrics: { grounding: "deterministic_immediate" },
    });
    return;
  }

  const rawChatHistory =
    options?.chatHistory?.length > 0
      ? options.chatHistory
      : getPublicChatHistory(sessionId);
  const chatHistory = sanitizeOfferKpHistory(rawChatHistory);

  let externalContexts = [];
  if (shopDbEnrichEnabled()) {
    const catalog = await getShopDbContext(message, {
      maxDocs: 5,
      chatHistory,
    }).catch((err) => {
      console.warn("[ShopDB] public chat enrich failed:", err?.message || err);
      return { contextTexts: [], sources: [], flags: { shopDbError: true } };
    });
    externalContexts = [
      {
        kind: "shopdb",
        contextTexts: catalog.contextTexts || [],
        sources: catalog.sources || [],
        flags: catalog.flags,
      },
    ];
  }

  const llmCatalog = applyExternalContextsForLlm(message, externalContexts);
  const sources = llmCatalog.sources;
  const groundedCatalogResponse = renderGroundedCatalogResponse(
    message,
    llmCatalog.catalogBlocks || []
  );
  if (groundedCatalogResponse) {
    appendPublicChatMessage(sessionId, "user", message);
    appendPublicChatMessage(sessionId, "assistant", groundedCatalogResponse);
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse: groundedCatalogResponse,
      sources,
      close: true,
      error: null,
      metrics: { grounding: "shopdb_direct" },
    });
    return;
  }

  // Resolve the model only after deterministic fast paths. Greetings and
  // direct catalog answers therefore pay neither model startup nor inference.
  const LLMConnector = await getLLMProviderWithFallback({
    provider: workspace.chatProvider,
    model: workspace.chatModel,
    log: (msg) => console.log(`\x1b[33m[OfferKP-LLM]\x1b[0m ${msg}`),
  });
  const systemPrompt = await chatPrompt(workspace, null);

  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt,
      userPrompt: llmCatalog.userPrompt,
      contextTexts: llmCatalog.contextTexts,
      chatHistory,
    },
    chatHistory
  );

  appendPublicChatMessage(sessionId, "user", message);

  try {
    if (LLMConnector.streamingEnabled() !== true) {
      const { textResponse } = await LLMConnector.getChatCompletion(messages, {
        temperature: workspace.openAiTemp ?? LLMConnector.defaultTemp,
      });
      if (textResponse) {
        appendPublicChatMessage(sessionId, "assistant", textResponse);
      }
      writeResponseChunk(response, {
        id: uuid,
        type: "textResponse",
        textResponse,
        sources,
        close: true,
        error: null,
      });
      return;
    }

    const stream = await LLMConnector.streamGetChatCompletion(messages, {
      temperature: workspace.openAiTemp ?? LLMConnector.defaultTemp,
    });
    const assistantText = await handleDefaultStreamResponseV2(
      response,
      stream,
      {
        uuid,
        sources,
      }
    );
    if (assistantText) {
      appendPublicChatMessage(sessionId, "assistant", assistantText);
    }
  } catch (e) {
    writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: e.message,
    });
  }
}

module.exports = { streamOfferKpPublicChat };
