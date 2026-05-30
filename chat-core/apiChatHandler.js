const { v4: uuidv4 } = require("uuid");
const { DocumentManager } = require("../DocumentManager");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { getVectorDbClass, getLLMProvider } = require("../helpers");
const {
  writeResponseChunk,
  runChatPostProcessWithKeepalive,
} = require("../helpers/chat/responses");
const {
  chatPrompt,
  sourceIdentifier,
  recentChatHistory,
  grepAllSlashCommands,
} = require("./index");
const {
  EphemeralAgentHandler,
  EphemeralEventListener,
} = require("../agents/ephemeral");
const { Telemetry } = require("../../models/telemetry");
const { CollectorApi } = require("../collectorApi");
const fs = require("fs");
const path = require("path");
const { hotdirPath, normalizePath, isWithin } = require("../files");
const { getShopDbContext, shopDbEnrichEnabled } = require("../shopDb/enrich");
const {
  buildExternalLinksSection,
  sourcesForResponse,
} = require("./externalLinksSection");
const { applyRussianStylePolish } = require("./russianStylePolish");
const { applyYandexFactCheck } = require("./yandexFactCheck");
const {
  applyOpenRouterGarantFactCheck,
} = require("./openRouterGarantFactCheck");
const {
  buildRagTrace,
  garantFlagsFromEnrichResult,
} = require("./ragTrace");

/** Log which context elements were sent to the LLM (visible in Railway logs). */
function logLLMContext(workspaceSlug, contextTexts, sources) {
  const garantCount = sources.filter((s) => s.docSource === "ГАРАНТ").length;
  const yandexCount = sources.filter((s) => s.docSource === "Яндекс").length;
  const googleCount = sources.filter(
    (s) =>
      s.docSource === "Google" || s.docSource === "Google (изображения)"
  ).length;
  const sourceDescriptors = sources.map((s) => ({
    docSource: s.docSource || "workspace",
    title: (s.title || s.chunkSource || s.filename || "").slice(0, 80),
  }));
  console.log(
    "[LLM context] workspace=%s contextChunks=%d sources=%d (garant=%d yandex=%d google=%d) elements:",
    workspaceSlug,
    contextTexts.length,
    sources.length,
    garantCount,
    yandexCount,
    googleCount
  );
  console.log("[LLM context] sources:", JSON.stringify(sourceDescriptors));
}
/**
 * @typedef ResponseObject
 * @property {string} id - uuid of response
 * @property {string} type - Type of response
 * @property {string|null} textResponse - full text response
 * @property {object[]} sources
 * @property {boolean} close
 * @property {string|null} error
 * @property {object} metrics
 */

/**
 * Users can pass in documents as attachments to the chat API.
 * The name of the document is the name of the attachment and must include the file extension.
 * the mime type for documents is `application/anythingllm-document` - anything else is assumed to be an image.
 * @param {{name: string, mime: string, contentString: string}[]} attachments
 * @returns {Promise<{parsedDocuments: Object[], imageAttachments: {name: string; mime: string; contentString: string}[]}>}
 */
async function processDocumentAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0)
    return { parsedDocuments: [], imageAttachments: [] };
  const documentAttachments = [];
  const imageAttachments = [];
  for (const attachment of attachments) {
    if (
      attachment &&
      attachment.contentString &&
      attachment.mime &&
      attachment.mime.toLowerCase() === "application/anythingllm-document"
    )
      documentAttachments.push(attachment);
    else imageAttachments.push(attachment);
  }

  if (documentAttachments.length === 0)
    return { parsedDocuments: [], imageAttachments };
  const Collector = new CollectorApi();
  const processingOnline = await Collector.online();
  if (!processingOnline) {
    console.warn(
      "Collector API is not online, skipping document attachment processing"
    );
    return { parsedDocuments: [], imageAttachments };
  }
  if (!fs.existsSync(hotdirPath)) fs.mkdirSync(hotdirPath, { recursive: true });

  const {
    hasRestrictedContent,
    getRestrictedMessage,
  } = require("../restrictedContent");
  const parsedDocuments = [];
  for (const attachment of documentAttachments) {
    try {
      let base64Data = attachment.contentString;
      const dataUriMatch = base64Data.match(/^data:[^;]+;base64,(.+)$/);
      if (dataUriMatch) base64Data = dataUriMatch[1];

      const buffer = Buffer.from(base64Data, "base64");
      const filename = normalizePath(
        attachment.name || `attachment-${uuidv4()}`
      );
      const filePath = normalizePath(path.join(hotdirPath, filename));
      if (!isWithin(hotdirPath, filePath))
        throw new Error(`Invalid file path for attachment ${filename}`);
      fs.writeFileSync(filePath, buffer);

      const { success, reason, documents } =
        await Collector.parseDocument(filename);
      if (success && documents?.length > 0) {
        const firstPageText = documents[0]?.pageContent || "";
        if (hasRestrictedContent(firstPageText)) {
          return {
            parsedDocuments: [],
            imageAttachments,
            restrictedContent: true,
            restrictedMessage: getRestrictedMessage(),
          };
        }
        parsedDocuments.push(...documents);
      } else {
        console.warn(`Failed to parse attachment ${filename}:`, reason);
      }
    } catch (error) {
      console.error(
        `Error processing attachment ${attachment.name}:`,
        error.message
      );
    }
  }

  return { parsedDocuments, imageAttachments };
}

/**
 * Handle synchronous chats with your workspace via the developer API endpoint
 * @param {{
 *  workspace: import("@prisma/client").workspaces,
 *  message:string,
 *  mode: "chat"|"query",
 *  user: import("@prisma/client").users|null,
 *  thread: import("@prisma/client").workspace_threads|null,
 *  sessionId: string|null,
 *  attachments: { name: string; mime: string; contentString: string }[],
 *  reset: boolean,
 * }} parameters
 * @returns {Promise<ResponseObject>}
 */
async function chatSync({
  workspace,
  message = null,
  mode = "chat",
  user = null,
  thread = null,
  sessionId = null,
  attachments = [],
  reset = false,
  webSearchEnrichEnabled = true,
}) {
  const uuid = uuidv4();
  const chatMode = mode ?? "chat";

  // If the user wants to reset the chat history we do so pre-flight
  // and continue execution. If no message is provided then the user intended
  // to reset the chat history only and we can exit early with a confirmation.
  if (reset) {
    await WorkspaceChats.markThreadHistoryInvalidV2({
      workspaceId: workspace.id,
      user_id: user?.id,
      thread_id: thread?.id,
      api_session_id: sessionId,
    });
    if (!message?.length) {
      return {
        id: uuid,
        type: "textResponse",
        textResponse: "Chat history was reset!",
        sources: [],
        close: true,
        error: null,
        metrics: {},
      };
    }
  }

  // Process slash commands
  // Since preset commands are not supported in API calls, we can just process the message here
  const processedMessage = await grepAllSlashCommands(message);
  message = processedMessage;

  if (EphemeralAgentHandler.isAgentInvocation({ message })) {
    await Telemetry.sendTelemetry("agent_chat_started");

    // Initialize the EphemeralAgentHandler to handle non-continuous
    // conversations with agents since this is over REST.
    const agentHandler = new EphemeralAgentHandler({
      uuid,
      workspace,
      prompt: message,
      userId: user?.id || null,
      threadId: thread?.id || null,
      sessionId,
    });

    // Establish event listener that emulates websocket calls
    // in Aibitat so that we can keep the same interface in Aibitat
    // but use HTTP.
    const eventListener = new EphemeralEventListener();
    await agentHandler.init();
    await agentHandler.createAIbitat({ handler: eventListener });
    agentHandler.startAgentCluster();

    // The cluster has started and now we wait for close event since
    // this is a synchronous call for an agent, so we return everything at once.
    // After this, we conclude the call as we normally do.
    return await eventListener
      .waitForClose()
      .then(async ({ thoughts, textResponse }) => {
        await WorkspaceChats.new({
          workspaceId: workspace.id,
          prompt: String(message),
          response: {
            text: textResponse,
            sources: [],
            attachments,
            type: chatMode,
            thoughts,
            ragTrace: buildRagTrace({
              sources: [],
              chatMode,
              workspaceId: workspace.id,
              prompt: String(message),
              garantFlags: { ephemeralAgentChat: true },
              webSearchEnrichEnabled,
            }),
          },
          include: false,
          apiSessionId: sessionId,
        });
        return {
          id: uuid,
          type: "textResponse",
          sources: [],
          close: true,
          error: null,
          textResponse,
          thoughts,
        };
      });
  }

  const LLMConnector = getLLMProvider({
    provider: workspace?.chatProvider,
    model: workspace?.chatModel,
  });
  const VectorDb = getVectorDbClass();
  const messageLimit = workspace?.openAiHistory || 20;
  const hasVectorizedSpace = await VectorDb.hasNamespace(workspace.slug);
  const embeddingsCount = await VectorDb.namespaceCount(workspace.slug);

  // User is trying to query-mode chat a workspace that has no data in it - so
  // we should exit early as no information can be found under these conditions.
  if ((!hasVectorizedSpace || embeddingsCount === 0) && chatMode === "query") {
    const textResponse =
      workspace?.queryRefusalResponse ??
      "There is no relevant information in this workspace to answer your query.";

    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: String(message),
      response: {
        text: textResponse,
        sources: [],
        attachments: attachments,
        type: chatMode,
        metrics: {},
        ragTrace: buildRagTrace({
          sources: [],
          chatMode,
          workspaceId: workspace.id,
          prompt: String(message),
          garantFlags: { queryModeNoEmbeddings: true },
          webSearchEnrichEnabled,
        }),
      },
      include: false,
      apiSessionId: sessionId,
    });

    return {
      id: uuid,
      type: "textResponse",
      sources: [],
      close: true,
      error: null,
      textResponse,
      metrics: {},
    };
  }

  // If we are here we know that we are in a workspace that is:
  // 1. Chatting in "chat" mode and may or may _not_ have embeddings
  // 2. Chatting in "query" mode and has at least 1 embedding
  let contextTexts = [];
  let sources = [];
  let pinnedDocIdentifiers = [];
  let garantEnrichFlags = { garantSkippedNoMessage: true };
  const { rawHistory, chatHistory } = await recentChatHistory({
    user,
    workspace,
    thread,
    messageLimit,
    apiSessionId: sessionId,
  });

  await new DocumentManager({
    workspace,
    maxTokens: LLMConnector.promptWindowLimit(),
  })
    .pinnedDocs()
    .then((pinnedDocs) => {
      pinnedDocs.forEach((doc) => {
        const { pageContent, ...metadata } = doc;
        pinnedDocIdentifiers.push(sourceIdentifier(doc));
        contextTexts.push(doc.pageContent);
        sources.push({
          text:
            pageContent.slice(0, 1_000) +
            "...continued on in source document...",
          ...metadata,
        });
      });
    });

  const processedAttachments = await processDocumentAttachments(attachments);
  if (processedAttachments.restrictedContent) {
    const errMsg =
      processedAttachments.restrictedMessage || "Restricted document.";
    console.error("[Chat] Could not respond to message:", errMsg);
    return {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: errMsg,
      metrics: {},
    };
  }
  const parsedAttachments = processedAttachments.parsedDocuments;
  attachments = processedAttachments.imageAttachments;
  parsedAttachments.forEach((doc) => {
    if (doc.pageContent) {
      contextTexts.push(doc.pageContent);
      const { pageContent, ...metadata } = doc;
      sources.push({
        text:
          pageContent.slice(0, 1_000) + "...continued on in source document...",
        ...metadata,
      });
    }
  });

  const vectorSearchResults =
    embeddingsCount !== 0
      ? await VectorDb.performSimilaritySearch({
          namespace: workspace.slug,
          input: message,
          LLMConnector,
          similarityThreshold: workspace?.similarityThreshold,
          topN: workspace?.topN,
          filterIdentifiers: pinnedDocIdentifiers,
          rerank: workspace?.vectorSearchMode === "rerank",
        })
      : {
          contextTexts: [],
          sources: [],
          message: null,
        };

  // Failed similarity search if it was run at all and failed.
  if (vectorSearchResults.message) {
    console.error("[Chat] Could not respond to message:", vectorSearchResults.message);
    return {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: vectorSearchResults.message,
      metrics: {},
    };
  }

  const { fillSourceWindow } = require("../helpers/chat");
  const filledSources = fillSourceWindow({
    nDocs: workspace?.topN || 4,
    searchResults: vectorSearchResults.sources,
    history: rawHistory,
    filterIdentifiers: pinnedDocIdentifiers,
  });

  // Why does contextTexts get all the info, but sources only get current search?
  // This is to give the ability of the LLM to "comprehend" a contextual response without
  // populating the Citations under a response with documents the user "thinks" are irrelevant
  // due to how we manage backfilling of the context to keep chats with the LLM more correct in responses.
  // If a past citation was used to answer the question - that is visible in the history so it logically makes sense
  // and does not appear to the user that a new response used information that is otherwise irrelevant for a given prompt.
  // TLDR; reduces GitHub issues for "LLM citing document that has no answer in it" while keep answers highly accurate.
  contextTexts = [...contextTexts, ...filledSources.contextTexts];
  sources = [...sources, ...vectorSearchResults.sources];

  // Enrich: каталог MySQL (purolat.com).
  let shopContextTexts = [];
  let shopSources = [];
  if (message?.trim() && shopDbEnrichEnabled()) {
    const shopResult = await getShopDbContext(message, {
      maxDocs: 5,
      chatHistory: rawHistory,
    }).catch((err) => {
      console.warn("[ShopDB] enrich failed:", err?.message || err);
      return { contextTexts: [], sources: [], flags: { shopDbError: true } };
    });
    garantEnrichFlags = shopResult.flags || {};
    shopContextTexts = shopResult.contextTexts || [];
    shopSources = shopResult.sources || [];
    if (shopContextTexts.length) {
      contextTexts = [...shopContextTexts, ...contextTexts];
    }
    if (shopSources.length) {
      sources = [...shopSources, ...sources];
    }
  }

  logLLMContext(workspace?.slug, contextTexts, sources);

  // If in query mode and no context chunks are found from search, backfill, or pins -  do not
  // let the LLM try to hallucinate a response or use general knowledge and exit early
  if (chatMode === "query" && contextTexts.length === 0) {
    const textResponse =
      workspace?.queryRefusalResponse ??
      "There is no relevant information in this workspace to answer your query.";

    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        attachments: attachments,
        type: chatMode,
        metrics: {},
        ragTrace: buildRagTrace({
          sources,
          chatMode,
          workspaceId: workspace.id,
          prompt: message,
          garantFlags: garantEnrichFlags,
          webSearchEnrichEnabled,
        }),
      },
      threadId: thread?.id || null,
      include: false,
      apiSessionId: sessionId,
      user,
    });

    return {
      id: uuid,
      type: "textResponse",
      sources: [],
      close: true,
      error: null,
      textResponse,
      metrics: {},
    };
  }

  // Compress & Assemble message to ensure prompt passes token limit with room for response
  // and build system messages based on inputs and history.
  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt: await chatPrompt(workspace, user),
      userPrompt: message,
      contextTexts,
      sources,
      chatHistory,
      attachments,
    },
    rawHistory
  );

  // Send the text completion.
  const { textResponse, metrics: performanceMetrics } =
    await LLMConnector.getChatCompletion(messages, {
      temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
      user: user,
    });

  if (!textResponse) {
    const errMsg = "No text completion could be completed with this input.";
    console.error("[Chat] Could not respond to message:", errMsg);
    return {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: errMsg,
      metrics: performanceMetrics,
    };
  }

  let bodyText = textResponse;
  bodyText = await applyYandexFactCheck(bodyText, contextTexts);
  bodyText = await applyOpenRouterGarantFactCheck(bodyText, contextTexts);
  const polished = await applyRussianStylePolish(bodyText);
  const externalLinks = buildExternalLinksSection(sources);
  const finalText = polished + externalLinks;
  const responseSources = sourcesForResponse(sources);
  console.log(
    "[Chat] response ready workspace=%s responseLen=%d sourcesShown=%d (external citations)",
    workspace?.slug,
    finalText?.length ?? 0,
    responseSources.length
  );

  const { chat } = await WorkspaceChats.new({
    workspaceId: workspace.id,
    prompt: message,
    response: {
      text: finalText,
      sources: responseSources,
      attachments,
      type: chatMode,
      metrics: performanceMetrics,
      ragTrace: buildRagTrace({
        sources,
        chatMode,
        workspaceId: workspace.id,
        prompt: message,
        garantFlags: garantEnrichFlags,
        webSearchEnrichEnabled,
      }),
    },
    threadId: thread?.id || null,
    apiSessionId: sessionId,
    user,
  });

  return {
    id: uuid,
    type: "textResponse",
    close: true,
    error: null,
    chatId: chat.id,
    textResponse: finalText,
    sources: responseSources,
    metrics: performanceMetrics,
  };
}

/**
 * Handle streamable HTTP chunks for chats with your workspace via the developer API endpoint
 * @param {{
 * response: import("express").Response,
 *  workspace: import("@prisma/client").workspaces,
 *  message:string,
 *  mode: "chat"|"query",
 *  user: import("@prisma/client").users|null,
 *  thread: import("@prisma/client").workspace_threads|null,
 *  sessionId: string|null,
 *  attachments: { name: string; mime: string; contentString: string }[],
 *  reset: boolean,
 * }} parameters
 * @returns {Promise<VoidFunction>}
 */
async function streamChat({
  response,
  workspace,
  message = null,
  mode = "chat",
  user = null,
  thread = null,
  sessionId = null,
  attachments = [],
  reset = false,
  webSearchEnrichEnabled = true,
}) {
  const uuid = uuidv4();
  const chatMode = mode ?? "chat";

  // If the user wants to reset the chat history we do so pre-flight
  // and continue execution. If no message is provided then the user intended
  // to reset the chat history only and we can exit early with a confirmation.
  if (reset) {
    await WorkspaceChats.markThreadHistoryInvalidV2({
      workspaceId: workspace.id,
      user_id: user?.id,
      thread_id: thread?.id,
      api_session_id: sessionId,
    });
    if (!message?.length) {
      writeResponseChunk(response, {
        id: uuid,
        type: "textResponse",
        textResponse: "Chat history was reset!",
        sources: [],
        attachments: [],
        close: true,
        error: null,
        metrics: {},
      });
      return;
    }
  }

  // Check for and process slash commands
  // Since preset commands are not supported in API calls, we can just process the message here
  const processedMessage = await grepAllSlashCommands(message);
  message = processedMessage;

  if (EphemeralAgentHandler.isAgentInvocation({ message })) {
    await Telemetry.sendTelemetry("agent_chat_started");

    // Initialize the EphemeralAgentHandler to handle non-continuous
    // conversations with agents since this is over REST.
    const agentHandler = new EphemeralAgentHandler({
      uuid,
      workspace,
      prompt: message,
      userId: user?.id || null,
      threadId: thread?.id || null,
      sessionId,
    });

    // Establish event listener that emulates websocket calls
    // in Aibitat so that we can keep the same interface in Aibitat
    // but use HTTP.
    const eventListener = new EphemeralEventListener();
    await agentHandler.init();
    await agentHandler.createAIbitat({ handler: eventListener });
    agentHandler.startAgentCluster();

    // The cluster has started and now we wait for close event since
    // and stream back any results we get from agents as they come in.
    return eventListener
      .streamAgentEvents(response, uuid)
      .then(async ({ thoughts, textResponse }) => {
        await WorkspaceChats.new({
          workspaceId: workspace.id,
          prompt: String(message),
          response: {
            text: textResponse,
            sources: [],
            attachments: attachments,
            type: chatMode,
            thoughts,
            ragTrace: buildRagTrace({
              sources: [],
              chatMode,
              workspaceId: workspace.id,
              prompt: String(message),
              garantFlags: { ephemeralAgentChat: true },
              webSearchEnrichEnabled,
            }),
          },
          include: true,
          threadId: thread?.id || null,
          apiSessionId: sessionId,
        });
        writeResponseChunk(response, {
          uuid,
          type: "finalizeResponseStream",
          textResponse,
          thoughts,
          close: true,
          error: false,
        });
      });
  }

  const LLMConnector = getLLMProvider({
    provider: workspace?.chatProvider,
    model: workspace?.chatModel,
  });

  const VectorDb = getVectorDbClass();
  const messageLimit = workspace?.openAiHistory || 20;
  const hasVectorizedSpace = await VectorDb.hasNamespace(workspace.slug);
  const embeddingsCount = await VectorDb.namespaceCount(workspace.slug);

  // User is trying to query-mode chat a workspace that has no data in it - so
  // we should exit early as no information can be found under these conditions.
  if ((!hasVectorizedSpace || embeddingsCount === 0) && chatMode === "query") {
    const textResponse =
      workspace?.queryRefusalResponse ??
      "There is no relevant information in this workspace to answer your query.";
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse,
      sources: [],
      attachments: [],
      close: true,
      error: null,
      metrics: {},
    });
    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        attachments: attachments,
        type: chatMode,
        metrics: {},
        ragTrace: buildRagTrace({
          sources: [],
          chatMode,
          workspaceId: workspace.id,
          prompt: message,
          garantFlags: { queryModeNoEmbeddings: true },
          webSearchEnrichEnabled,
        }),
      },
      threadId: thread?.id || null,
      apiSessionId: sessionId,
      include: false,
      user,
    });
    return;
  }

  // If we are here we know that we are in a workspace that is:
  // 1. Chatting in "chat" mode and may or may _not_ have embeddings
  // 2. Chatting in "query" mode and has at least 1 embedding
  let completeText;
  let metrics = {};
  let contextTexts = [];
  let sources = [];
  let garantEnrichFlags = { garantSkippedNoMessage: true };
  let pinnedDocIdentifiers = [];
  const { rawHistory, chatHistory } = await recentChatHistory({
    user,
    workspace,
    thread,
    messageLimit,
    apiSessionId: sessionId,
  });

  // Look for pinned documents and see if the user decided to use this feature. We will also do a vector search
  // as pinning is a supplemental tool but it should be used with caution since it can easily blow up a context window.
  // However we limit the maximum of appended context to 80% of its overall size, mostly because if it expands beyond this
  // it will undergo prompt compression anyway to make it work. If there is so much pinned that the context here is bigger than
  // what the model can support - it would get compressed anyway and that really is not the point of pinning. It is really best
  // suited for high-context models.
  await new DocumentManager({
    workspace,
    maxTokens: LLMConnector.promptWindowLimit(),
  })
    .pinnedDocs()
    .then((pinnedDocs) => {
      pinnedDocs.forEach((doc) => {
        const { pageContent, ...metadata } = doc;
        pinnedDocIdentifiers.push(sourceIdentifier(doc));
        contextTexts.push(doc.pageContent);
        sources.push({
          text:
            pageContent.slice(0, 1_000) +
            "...continued on in source document...",
          ...metadata,
        });
      });
    });

  const processedAttachments = await processDocumentAttachments(attachments);
  if (processedAttachments.restrictedContent) {
    writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: processedAttachments.restrictedMessage || "Restricted document.",
      metrics: {},
    });
    return;
  }
  const parsedAttachments = processedAttachments.parsedDocuments;
  attachments = processedAttachments.imageAttachments;
  parsedAttachments.forEach((doc) => {
    if (doc.pageContent) {
      contextTexts.push(doc.pageContent);
      const { pageContent, ...metadata } = doc;
      sources.push({
        text:
          pageContent.slice(0, 1_000) + "...continued on in source document...",
        ...metadata,
      });
    }
  });

  const vectorSearchResults =
    embeddingsCount !== 0
      ? await VectorDb.performSimilaritySearch({
          namespace: workspace.slug,
          input: message,
          LLMConnector,
          similarityThreshold: workspace?.similarityThreshold,
          topN: workspace?.topN,
          filterIdentifiers: pinnedDocIdentifiers,
          rerank: workspace?.vectorSearchMode === "rerank",
        })
      : {
          contextTexts: [],
          sources: [],
          message: null,
        };

  // Failed similarity search if it was run at all and failed.
  if (vectorSearchResults.message) {
    writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: vectorSearchResults.message,
      metrics: {},
    });
    return;
  }

  const { fillSourceWindow } = require("../helpers/chat");
  const filledSources = fillSourceWindow({
    nDocs: workspace?.topN || 4,
    searchResults: vectorSearchResults.sources,
    history: rawHistory,
    filterIdentifiers: pinnedDocIdentifiers,
  });

  // Why does contextTexts get all the info, but sources only get current search?
  // This is to give the ability of the LLM to "comprehend" a contextual response without
  // populating the Citations under a response with documents the user "thinks" are irrelevant
  // due to how we manage backfilling of the context to keep chats with the LLM more correct in responses.
  // If a past citation was used to answer the question - that is visible in the history so it logically makes sense
  // and does not appear to the user that a new response used information that is otherwise irrelevant for a given prompt.
  // TLDR; reduces GitHub issues for "LLM citing document that has no answer in it" while keep answers highly accurate.
  contextTexts = [...contextTexts, ...filledSources.contextTexts];
  sources = [...sources, ...vectorSearchResults.sources];

  // Enrich: каталог MySQL (purolat.com).
  let shopContextTexts = [];
  let shopSources = [];
  if (message?.trim() && shopDbEnrichEnabled()) {
    const shopResult = await getShopDbContext(message, {
      maxDocs: 5,
      chatHistory: rawHistory,
    }).catch((err) => {
      console.warn("[ShopDB] enrich failed:", err?.message || err);
      return { contextTexts: [], sources: [], flags: { shopDbError: true } };
    });
    garantEnrichFlags = shopResult.flags || {};
    shopContextTexts = shopResult.contextTexts || [];
    shopSources = shopResult.sources || [];
    if (shopContextTexts.length) {
      contextTexts = [...shopContextTexts, ...contextTexts];
    }
    if (shopSources.length) {
      sources = [...shopSources, ...sources];
    }
  }

  console.log("[Chat] context formed", {
    workspace: workspace?.slug,
    messageLen: message?.length ?? 0,
    contextChunks: contextTexts.length,
    sourcesCount: sources.length,
    shopDb: shopDbEnrichEnabled(),
    shopDbChunks: shopContextTexts.length,
  });

  // If in query mode and no context chunks are found from search, backfill, or pins -  do not
  // let the LLM try to hallucinate a response or use general knowledge and exit early
  if (chatMode === "query" && contextTexts.length === 0) {
    const textResponse =
      workspace?.queryRefusalResponse ??
      "There is no relevant information in this workspace to answer your query.";
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse,
      sources: [],
      close: true,
      error: null,
      metrics: {},
    });

    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        attachments: attachments,
        type: chatMode,
        metrics: {},
        ragTrace: buildRagTrace({
          sources,
          chatMode,
          workspaceId: workspace.id,
          prompt: message,
          garantFlags: garantEnrichFlags,
          webSearchEnrichEnabled,
        }),
      },
      threadId: thread?.id || null,
      apiSessionId: sessionId,
      include: false,
      user,
    });
    return;
  }

  // Compress & Assemble message to ensure prompt passes token limit with room for response
  // and build system messages based on inputs and history.
  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt: await chatPrompt(workspace, user),
      userPrompt: message,
      contextTexts,
      sources,
      chatHistory,
      attachments,
    },
    rawHistory
  );

  // If streaming is not explicitly enabled for connector
  // we do regular waiting of a response and send a single chunk.
  const responseSources = sourcesForResponse(sources);
  let usedTokenStreaming = false;
  if (LLMConnector.streamingEnabled() !== true) {
    console.log(
      `\x1b[31m[STREAMING DISABLED]\x1b[0m Streaming is not available for ${LLMConnector.constructor.name}. Will use regular chat method.`
    );
    const { textResponse, metrics: performanceMetrics } =
      await LLMConnector.getChatCompletion(messages, {
        temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
        user: user,
      });
    completeText = await runChatPostProcessWithKeepalive(response, async () => {
      let t = await applyYandexFactCheck(
        textResponse || "",
        contextTexts || []
      );
      t = await applyOpenRouterGarantFactCheck(t || "", contextTexts || []);
      return await applyRussianStylePolish(t || "");
    });
    metrics = performanceMetrics;
    const externalLinks = buildExternalLinksSection(sources);
    const finalText = (completeText || "") + externalLinks;
    writeResponseChunk(response, {
      uuid,
      sources: responseSources,
      type: "textResponseChunk",
      textResponse: finalText,
      close: true,
      error: false,
      metrics,
    });
  } else {
    usedTokenStreaming = true;
    const stream = await LLMConnector.streamGetChatCompletion(messages, {
      temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
      user: user,
    });
    completeText = await LLMConnector.handleStream(response, stream, { uuid });
    metrics = stream.metrics;
    const rawStreamed = completeText;
    completeText = await runChatPostProcessWithKeepalive(response, async () => {
      let t = await applyYandexFactCheck(
        completeText || "",
        contextTexts || []
      );
      t = await applyOpenRouterGarantFactCheck(t || "", contextTexts || []);
      return await applyRussianStylePolish(t || "");
    });
    if (
      usedTokenStreaming &&
      completeText !== rawStreamed &&
      response?.writable &&
      (completeText?.length || 0) > 0
    ) {
      writeResponseChunk(response, {
        uuid,
        sources: [],
        type: "textResponseChunk",
        textResponse: completeText,
        replaceStreamContent: true,
        close: false,
        error: false,
      });
    }
  }

  if (completeText?.length > 0) {
    const externalLinks = buildExternalLinksSection(sources);
    const finalText = completeText + externalLinks;
    console.log(
      "[Chat] response ready workspace=%s responseLen=%d sourcesShown=%d (external citations) stream=true",
      workspace?.slug,
      finalText?.length ?? 0,
      responseSources.length
    );
    if (externalLinks && LLMConnector.streamingEnabled() === true) {
      writeResponseChunk(response, {
        uuid,
        sources: responseSources,
        type: "textResponseChunk",
        textResponse: externalLinks,
        close: false,
        error: false,
      });
    }
    const { chat } = await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: finalText,
        sources: responseSources,
        type: chatMode,
        metrics,
        attachments,
        ragTrace: buildRagTrace({
          sources,
          chatMode,
          workspaceId: workspace.id,
          prompt: message,
          garantFlags: garantEnrichFlags,
          webSearchEnrichEnabled,
        }),
      },
      threadId: thread?.id || null,
      apiSessionId: sessionId,
      user,
    });

    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
      metrics,
      sources: responseSources,
    });
    return;
  }

  writeResponseChunk(response, {
    uuid,
    type: "finalizeResponseStream",
    close: true,
    error: false,
  });
  return;
}

module.exports.ApiChatHandler = {
  chatSync,
  streamChat,
};
