const pluralize = require("pluralize");
const {
  WorkspaceAgentInvocation,
} = require("../../models/workspaceAgentInvocation");
const { writeResponseChunk } = require("../helpers/chat/responses");
const { Workspace } = require("../../models/workspace");

/**
 * In-memory cache for attachments associated with agent invocations.
 * @type {Map<string, Array>}
 */
const invocationAttachmentsCache = new Map();

function cacheInvocationAttachments(uuid, attachments = []) {
  if (attachments.length > 0) {
    invocationAttachmentsCache.set(uuid, attachments);
  }
}

function getAndClearInvocationAttachments(uuid) {
  const attachments = invocationAttachmentsCache.get(uuid) || [];
  invocationAttachmentsCache.delete(uuid);
  return attachments;
}

/**
 * Returns true when the message is explicitly requesting file/document creation
 * so that the agent can be auto-invoked without the user needing to type @agent.
 */
function wantsFileCreation(message = "") {
  const m = message.toLowerCase();
  return (
    /\bpdf\b/.test(m) ||
    /\bcreate\s+(a\s+)?(pdf|document|doc|file|report|quotation|quote|presentation|spreadsheet|excel)\b/.test(
      m
    ) ||
    /\bgenerate\s+(a\s+)?(pdf|document|doc|file|report|quotation|quote|presentation|spreadsheet|excel)\b/.test(
      m
    ) ||
    /\bmake\s+(a\s+)?(pdf|document|doc|file|report|quotation|quote|presentation|spreadsheet|excel)\b/.test(
      m
    ) ||
    /\bexport\s+(as\s+|to\s+)?(pdf|document|doc|file)\b/.test(m) ||
    /\bconvert\s+.{0,40}\b(pdf|document|doc)\b/.test(m) ||
    // French
    /\bcréer?\s+(un\s+)?(pdf|document|devis|rapport|fichier|présentation)\b/.test(
      m
    ) ||
    /\bgénérer?\s+(un\s+)?(pdf|document|devis|rapport|fichier|présentation)\b/.test(
      m
    ) ||
    /\btélécharger\s+(au\s+format\s+)?(pdf|document)\b/.test(m) ||
    // Russian — commercial offers / documents (purolat.com)
    /коммерческ(ое|ого|ая)\s+предложен/i.test(m) ||
    /\bкп\b/.test(m) ||
    /оферт/i.test(m) ||
    /сформируй.*(документ|оферт|кп|word|docx)/i.test(m) ||
    /подготовь.*(документ|оферт|кп|word|docx|предложен|коммерческ)/i.test(m) ||
    (/подготовь/i.test(m) && /коммерческ/i.test(m)) ||
    /сгенерируй.*(документ|оферт|кп|word|docx)/i.test(m) ||
    /скачать.*(документ|оферт|word|docx)/i.test(m) ||
    // Polish
    /ofert[ęae]/i.test(m) ||
    /wygeneruj.*(dokument|ofert)/i.test(m) ||
    /przygotuj.*(dokument|ofert|propozycj)/i.test(m) ||
    (/przygotuj/i.test(m) && /ofert/i.test(m)) ||
    /pobierz.*(dokument|ofert|word|docx)/i.test(m)
  );
}

async function grepAgents({
  uuid,
  response,
  message,
  workspace,
  user = null,
  thread = null,
  attachments = [],
}) {
  const { shopDbEnrichEnabled } = require("../offerKp/enrich");
  const { isCatalogRelayRequest } = require("../offerKp/productSearchAgent");
  const {
    isQuoteDocumentRequest,
    quoteDocumentStatusMessage,
  } = require("../offerKp/quoteRequestPhrases");
  const { offerKpLog } = require("../offerKpApp/offerKpLog");

  const quoteDocRequest = isQuoteDocumentRequest(message);
  const agentHandles = WorkspaceAgentInvocation.parseAgents(message);
  const explicitAgentRequest = agentHandles.length > 0;
  // Запросы КП (в т.ч. с @agent) идут через серверный ShopDB pipeline:
  // файл → match/analog → DOCX+PDF. Иначе модель зовёт rag-memory / web-scraping.
  // Явный @agent без фразы КП сохраняет агентный режим.
  const routeKpViaCatalogStream =
    shopDbEnrichEnabled() &&
    (quoteDocRequest ||
      (!explicitAgentRequest &&
        (wantsFileCreation(message) || isCatalogRelayRequest(message))));

  if (quoteDocRequest) {
    offerKpLog(
      "info",
      routeKpViaCatalogStream
        ? "Quote phrase → routing to deterministic ShopDB pipeline"
        : "Quote phrase → routing to explicit @agent",
      {
        message: String(message).slice(0, 160),
        workspace: workspace?.slug || null,
      }
    );
  }

  let nativeToolingEnabled = false;

  // If the workspace is in automatic mode, check if the workspace supports native tooling
  if (workspace?.chatMode === "automatic" && !routeKpViaCatalogStream)
    nativeToolingEnabled = await Workspace.supportsNativeToolCalling(workspace);

  // Auto-trigger agent when user asks for file/PDF creation without typing @agent
  const autoAgent =
    agentHandles.length === 0 &&
    (wantsFileCreation(message) || quoteDocRequest) &&
    !routeKpViaCatalogStream;

  if (
    (agentHandles.length > 0 && !routeKpViaCatalogStream) ||
    nativeToolingEnabled ||
    autoAgent
  ) {
    const { invocation: newInvocation } = await WorkspaceAgentInvocation.new({
      prompt: message,
      workspace: workspace,
      user: user,
      thread: thread,
    });

    if (!newInvocation) {
      writeResponseChunk(response, {
        id: uuid,
        type: "statusResponse",
        textResponse: agentHandles.length
          ? `${pluralize("Agent", agentHandles.length)} ${agentHandles.join(", ")} could not be called. Chat will be handled as default chat.`
          : "Could not start agent. Chat will be handled as default chat.",
        sources: [],
        close: true,
        animate: false,
        error: null,
      });
      return;
    }

    cacheInvocationAttachments(newInvocation.uuid, attachments);

    writeResponseChunk(response, {
      id: uuid,
      type: "agentInitWebsocketConnection",
      textResponse: null,
      sources: [],
      close: false,
      error: null,
      websocketUUID: newInvocation.uuid,
    });

    if (autoAgent) {
      writeResponseChunk(response, {
        id: uuid,
        type: "statusResponse",
        textResponse: quoteDocRequest
          ? quoteDocumentStatusMessage()
          : "Creating document…",
        sources: [],
        close: true,
        error: null,
        animate: true,
      });
    }
    return true;
  }

  return false;
}

module.exports = {
  grepAgents,
  getAndClearInvocationAttachments,
  wantsFileCreation,
};
