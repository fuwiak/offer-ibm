const { v4: uuidv4 } = require("uuid");
const { Workspace } = require("../../models/workspace");
const { getLLMProvider } = require("../helpers");
const { chatPrompt } = require("./index");
const {
  writeResponseChunk,
  handleDefaultStreamResponseV2,
} = require("../helpers/chat/responses");
const { PUBLIC_PROMPT_APPEND } = require("../lawyerRevizorro/prompts");
const {
  getCatalogEnrichContext,
  isCatalogEnrichEnabled,
} = require("../offerKp/enrich");
const { getEliContext } = require("../eli/enrich");
const { isPolishText } = require("../lang/detectPolish");

function isPolishLanguageCode(language) {
  if (!language || typeof language !== "string") return false;
  return /^pl(\b|[-_])/i.test(language.trim());
}

function eliEnabled() {
  const v = (process.env.ELI_DISABLED || "").trim().toLowerCase();
  return !["1", "true", "yes", "on"].includes(v);
}

/**
 * Wybór polskiego źródła ELI: jawny język UI ma pierwszeństwo, w przeciwnym
 * razie autodetekcja treści. ELI_FORCE=1 wymusza ELI.
 */
function shouldUseEli(message, language) {
  if (!eliEnabled()) return false;
  const force = (process.env.ELI_FORCE || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(force)) return true;
  if (language && String(language).trim()) return isPolishLanguageCode(language);
  return isPolishText(message);
}

async function streamLawyerRevizorroPublicChat(
  response,
  message,
  _sessionId = "public",
  options = {}
) {
  const language = options?.language || null;
  const slug = process.env.LAWYER_REVIZORRO_PUBLIC_WORKSPACE || "lawyerRevizorro-public";
  const workspace = await Workspace.get({ slug });

  if (!workspace) {
    writeResponseChunk(response, {
      id: uuidv4(),
      type: "abort",
      textResponse: `Public workspace "${slug}" not found. Create a workspace with this slug or set LAWYER_REVIZORRO_PUBLIC_WORKSPACE.`,
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

  const basePrompt = await chatPrompt(workspace, null);
  const systemPrompt = `${basePrompt}\n\n${PUBLIC_PROMPT_APPEND}`;
  const uuid = uuidv4();

  let contextTexts = [];
  let sources = [];
  if (shouldUseEli(message, language)) {
    // Tryb polski — źródłem jest ELI API (Dziennik Ustaw / Monitor Polski).
    const eli = await getEliContext(message, { maxDocs: 3 }).catch((err) => {
      console.warn("[ELI] public chat enrich failed:", err?.message || err);
      return { contextTexts: [], sources: [] };
    });
    contextTexts = eli.contextTexts || [];
    sources = eli.sources || [];
  } else if (isCatalogEnrichEnabled()) {
    const catalog = await getCatalogEnrichContext(message, {
      maxDocs: 3,
      includeSutyazhnik: true,
      sutyazhnikCount: 3,
    }).catch((err) => {
      console.warn("[Catalog] public chat enrich failed:", err?.message || err);
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

module.exports = { streamLawyerRevizorroPublicChat };
