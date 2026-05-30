const { v4: uuidv4 } = require("uuid");
const { Workspace } = require("../../models/workspace");
const { getLLMProvider } = require("../helpers");
const { chatPrompt } = require("./index");
const {
  writeResponseChunk,
  handleDefaultStreamResponseV2,
} = require("../helpers/chat/responses");
const { getShopDbContext, shopDbEnrichEnabled } = require("../offerKp/enrich");

async function streamOfferKpPublicChat(
  response,
  message,
  _sessionId = "public",
  options = {}
) {
  const slug =
    process.env.OFFER_KP_PUBLIC_WORKSPACE || "offerKp-public";
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

  const LLMConnector = getLLMProvider({
    provider: workspace.chatProvider,
    model: workspace.chatModel,
  });

  const systemPrompt = await chatPrompt(workspace, null);
  const uuid = uuidv4();

  let contextTexts = [];
  let sources = [];
  if (shopDbEnrichEnabled()) {
    const catalog = await getShopDbContext(message, {
      maxDocs: 5,
      chatHistory: options?.chatHistory || [],
    }).catch((err) => {
      console.warn("[ShopDB] public chat enrich failed:", err?.message || err);
      return { contextTexts: [], sources: [] };
    });
    contextTexts = catalog.contextTexts || [];
    sources = catalog.sources || [];
  }

  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt,
      userPrompt: message,
      contextTexts,
      sources,
      chatHistory: [],
    },
    []
  );

  try {
    if (LLMConnector.streamingEnabled() !== true) {
      const { textResponse } = await LLMConnector.getChatCompletion(messages, {
        temperature: workspace.openAiTemp ?? LLMConnector.defaultTemp,
      });
      writeResponseChunk(response, {
        id: uuid,
        type: "textResponse",
        textResponse,
        sources: [],
        close: true,
        error: null,
      });
      return;
    }

    const stream = await LLMConnector.streamGetChatCompletion(messages, {
      temperature: workspace.openAiTemp ?? LLMConnector.defaultTemp,
    });
    await handleDefaultStreamResponseV2(response, stream, {
      uuid,
      sources,
    });
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
