const { v4: uuidv4 } = require("uuid");
const { DocumentManager } = require("../DocumentManager");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { WorkspaceParsedFiles } = require("../../models/workspaceParsedFiles");
const { getVectorDbClass, getLLMProviderWithFallback } = require("../helpers");
const { writeResponseChunk } = require("../helpers/chat/responses");
const { grepAgents } = require("./agents");
const {
  grepCommand,
  VALID_COMMANDS,
  chatPrompt,
  recentChatHistory,
  sourceIdentifier,
} = require("./index");
const {
  collectExternalContexts,
  dedupeSources,
  estimateChatCost,
  runGenerationPipeline,
} = require("./generation");
const { buildExternalLinksSection } = require("../garant/linksFooter");

const VALID_CHAT_MODE = ["automatic", "chat", "query"];

async function streamChatWithWorkspace(
  response,
  workspace,
  message,
  chatMode = "automatic",
  user = null,
  thread = null,
  attachments = [],
  conversationMemory = null,
  options = {}
) {
  // Jawny język interfejsu (np. z przełącznika i18next na froncie). Decyduje
  // o wyborze źródła prawnego (pl → ELI API, inne → ГАРАНТ) niezależnie od
  // automatycznej detekcji języka treści wiadomości.
  const language = options?.language || null;
  const uuid = uuidv4();
  const commandMessage = await grepCommand(message, user);

  // Small local models may repeat a catalog block from chat history even when
  // ShopDB enrichment was correctly skipped. Keep casual OfferKP messages out
  // of the LLM/agent path entirely so stale commercial data cannot leak into a
  // greeting response.
  const { shopDbEnrichEnabled } = require("../offerKp/enrich");
  const { resolveOfferKpImmediateReply } = require("../offerKp/immediateReply");
  const immediateReply = shopDbEnrichEnabled()
    ? resolveOfferKpImmediateReply(commandMessage)
    : null;
  if (immediateReply) {
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse: immediateReply,
      sources: [],
      attachments,
      close: true,
      error: null,
    });
    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: immediateReply,
        sources: [],
        type: chatMode,
        attachments,
      },
      threadId: thread?.id || null,
      include: false,
      user,
    });
    return;
  }

  // Fetched early (before the quote-intent check below) because an attached
  // PDF inquiry — not just a matching phrase in the chat message — must be
  // able to switch the pipeline into ShopDB-only mode. See parsedTextHasQuoteSignals.
  const parsedFiles = await WorkspaceParsedFiles.getContextFiles(
    workspace,
    thread || null,
    user || null
  );
  const parsedFileTexts = parsedFiles
    .map((doc) => doc.pageContent)
    .filter(Boolean);

  const { isQuoteDocumentRequest } = require("../offerKp/quoteRequestPhrases");
  const {
    parsedTextHasQuoteSignals,
  } = require("../offerKp/quotePdfModelRouter");
  const {
    OFFER_KP_INTENTS,
    routeOfferKpMessage,
  } = require("../offerKp/intentRouter");
  const {
    detectQuoteCreationIntentWithLlm,
    mightNeedLlmQuoteJudge,
  } = require("../offerKp/quoteIntentJudge");
  // Trigger ShopDB-only mode either when the message text asks for a КП/oferta
  // directly, or when an attached/pinned file already looks like a priced
  // inquiry — otherwise a bare "here's the file" message with no recognized
  // trigger phrase silently falls through to vector search / web enrich,
  // reopening the hallucination path the ShopDB-only mandate exists to close.
  let routedIntent = routeOfferKpMessage(commandMessage);
  let generalIntentJudgeAttempted = false;
  if (
    shopDbEnrichEnabled() &&
    routedIntent.primaryIntent === OFFER_KP_INTENTS.AMBIGUOUS
  ) {
    const { resolveOfferKpIntent } = require("../offerKp/intentLlmJudge");
    generalIntentJudgeAttempted = true;
    routedIntent = await resolveOfferKpIntent(commandMessage, { workspace });
  }
  const attachmentOnlyPrompt =
    /(?:вот|держи|прикрепил|загрузил|посмотри).{0,30}(?:файл|pdf|заявк)|(?:here|attached|uploaded).{0,30}(?:file|pdf|request)/iu.test(
      commandMessage
    );
  const attachmentQuoteRequest =
    parsedTextHasQuoteSignals(parsedFileTexts.join("\n")) &&
    (attachmentOnlyPrompt ||
      routedIntent.primaryIntent === OFFER_KP_INTENTS.AMBIGUOUS);
  let quoteDocumentRequest =
    isQuoteDocumentRequest(commandMessage) || attachmentQuoteRequest;

  if (
    !quoteDocumentRequest &&
    (!generalIntentJudgeAttempted ||
      routedIntent.primaryIntent === OFFER_KP_INTENTS.OUT_OF_SCOPE) &&
    [OFFER_KP_INTENTS.AMBIGUOUS, OFFER_KP_INTENTS.OUT_OF_SCOPE].includes(
      routedIntent.primaryIntent
    ) &&
    mightNeedLlmQuoteJudge([commandMessage])
  ) {
    quoteDocumentRequest = await detectQuoteCreationIntentWithLlm({
      userMessages: [commandMessage],
      workspace,
    });
  }
  const updatedMessage = quoteDocumentRequest
    ? String(commandMessage)
        .replace(/^@agent\s*:?\s*/i, "")
        .trim()
    : commandMessage;

  if (Object.keys(VALID_COMMANDS).includes(commandMessage)) {
    const data = await VALID_COMMANDS[commandMessage](
      workspace,
      message,
      uuid,
      user,
      thread
    );
    writeResponseChunk(response, data);
    return;
  }

  // If is agent enabled chat we will exit this flow early.
  const isAgentChat = await grepAgents({
    uuid,
    response,
    message: updatedMessage,
    user,
    workspace,
    thread,
    attachments,
  });
  if (isAgentChat) return;

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
      attachments,
      close: true,
      error: null,
    });
    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        type: chatMode,
        attachments,
      },
      threadId: thread?.id || null,
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
  let externalContexts = [];
  let ragTrace = {};
  let pinnedDocIdentifiers = [];
  const { rawHistory, chatHistory } = await recentChatHistory({
    user,
    workspace,
    thread,
    messageLimit,
  });

  // parsedFiles / parsedFileTexts were already fetched above (needed for the
  // quoteDocumentRequest check before the agent-mode early-return).
  const {
    resolveQuotePdfModelSwitch,
  } = require("../offerKp/quotePdfModelRouter");
  const quotePdfModelSwitch = resolveQuotePdfModelSwitch({
    message: updatedMessage,
    workspace,
    parsedFiles,
    parsedFileTexts,
  });
  const effectiveChatModel = quotePdfModelSwitch?.model || workspace?.chatModel;
  const effectiveChatProvider =
    quotePdfModelSwitch?.provider || workspace?.chatProvider;

  const LLMConnector = await getLLMProviderWithFallback({
    provider: effectiveChatProvider,
    model: effectiveChatModel,
    forceRefresh: true,
  });

  if (LLMConnector?.fallbackReason === "openrouter_unreachable") {
    const fallbackModel =
      LLMConnector?.model || process.env.LMSTUDIO_MODEL_PREF || "LM Studio";
    writeResponseChunk(response, {
      uuid,
      type: "statusResponse",
      content: `OpenRouter/egress недоступен — ответ через LM Studio (${fallbackModel}).`,
    });
  }
  const shopEnrichPromise = collectExternalContexts({
    message: updatedMessage,
    workspace,
    language,
    chatHistory: rawHistory,
    parsedFileTexts,
    threadId: thread?.id || null,
    onProgress: (payload = {}) => {
      writeResponseChunk(response, {
        uuid,
        type: "offerKpQuotePanel",
        content: {
          documentPanelView: "draftTable",
          progressStage: payload.progressStage || "searching",
          matchedCount: payload.matchedCount,
          total: payload.total,
          lineCount: payload.lineCount,
          quoteDraft: payload.quoteDraft || {
            step: 2,
            hardwareLines: [],
            preview: { lines: [] },
          },
        },
      });
    },
  });

  // Look for pinned documents
  // as pinning is a supplemental tool but it should be used with caution since it can easily blow up a context window.
  // However we limit the maximum of appended context to 80% of its overall size, mostly because if it expands beyond this
  // it will undergo prompt compression anyway to make it work. If there is so much pinned that the context here is bigger than
  // what the model can support - it would get compressed anyway and that really is not the point of pinning. It is really best
  // suited for high-context models.
  if (!quoteDocumentRequest) {
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
  }

  parsedFiles.forEach((doc) => {
    const { pageContent, title, ...metadata } = doc;
    const docName = title || metadata?.source || "Прикреплённый документ";
    // Explicit untrusted delimiters: model must treat body as DATA only
    // (prompt-injection isolation — see AUDYT §12 / prompts.js).
    const labeled =
      `=== ПРИКРЕПЛЁННЫЙ ДОКУМЕНТ: ${docName} ===\n` +
      `<<<UNTRUSTED_USER_DOCUMENT>>>\n${pageContent}\n<<<END_UNTRUSTED_USER_DOCUMENT>>>\n` +
      `=== КОНЕЦ ДОКУМЕНТА ===`;
    contextTexts.push(labeled);
    sources.push({
      text:
        pageContent.slice(0, 1_000) + "...continued on in source document...",
      title: docName,
      ...metadata,
    });
  });

  const vectorSearchResults =
    !quoteDocumentRequest && embeddingsCount !== 0
      ? await VectorDb.performSimilaritySearch({
          namespace: workspace.slug,
          input: updatedMessage,
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
  if (!!vectorSearchResults.message) {
    writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: vectorSearchResults.message,
    });
    return;
  }

  const { fillSourceWindow } = require("../helpers/chat");
  const filledSources = quoteDocumentRequest
    ? { contextTexts: [], sources: [] }
    : fillSourceWindow({
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
  ragTrace = {
    pinnedCount: pinnedDocIdentifiers.length,
    vectorHits: vectorSearchResults.sources.length,
    backfilledHits: Math.max(
      0,
      (filledSources?.sources?.length || 0) -
        (vectorSearchResults?.sources?.length || 0)
    ),
    parsedFilesCount: parsedFiles.length,
  };
  try {
    const { teacherLlmMeta } = require("../offerKpApp/teacherLlm");
    const teacher = teacherLlmMeta();
    // Internal only: teacher answers for local-model training / prompt tuning.
    if (teacher) ragTrace.teacher = teacher;
  } catch {
    /* ignore */
  }

  externalContexts = await shopEnrichPromise;
  const {
    applyExternalContextsForLlm,
    applyInquiryDraftToUserPrompt,
  } = require("../offerKp/catalogPrompt");
  const llmCatalog = applyExternalContextsForLlm(
    updatedMessage,
    externalContexts
  );
  const userPromptWithDraft = await applyInquiryDraftToUserPrompt(
    llmCatalog.userPrompt,
    {
      message: updatedMessage,
      workspace,
      chatHistory: rawHistory,
      parsedFileTexts,
      inquiryDraft: llmCatalog.inquiryDraft,
    }
  );
  if (llmCatalog.inquiryDraft?.lines?.length) {
    const draft = llmCatalog.inquiryDraft;
    writeResponseChunk(response, {
      uuid,
      type: "offerKpQuotePanel",
      content: {
        documentPanelView: "draftTable",
        progressStage: "matched",
        quoteDraft: {
          step: 2,
          reference: draft.reference,
          hardwareLines: draft.lines,
          preview: {
            lines: draft.lines,
            subtotal: draft.subtotal,
            total: draft.total,
            totalWeightKg: draft.totalWeightKg,
          },
        },
      },
    });
  }
  if (llmCatalog.contextTexts.length) {
    contextTexts = [...llmCatalog.contextTexts, ...contextTexts];
  }
  if (llmCatalog.sources.length) {
    sources = [...llmCatalog.sources, ...sources];
  }
  sources = dedupeSources(sources);
  const userPromptForLlm = userPromptWithDraft;
  ragTrace.external = externalContexts.map((ctx) => ({
    kind: ctx.kind || "external",
    contexts: Array.isArray(ctx.contextTexts) ? ctx.contextTexts.length : 0,
    sources: Array.isArray(ctx.sources) ? ctx.sources.length : 0,
    catalogInjected:
      ctx.kind === "shopdb" ? llmCatalog.catalogInjected : undefined,
  }));

  const {
    renderGroundedCatalogResponse,
    sanitizeOfferKpHistory,
  } = require("../offerKp/groundedResponse");
  const groundedCatalogResponse = quoteDocumentRequest
    ? null
    : renderGroundedCatalogResponse(
        updatedMessage,
        llmCatalog.catalogBlocks || [],
        routedIntent
      );
  if (groundedCatalogResponse) {
    writeResponseChunk(response, {
      uuid,
      sources,
      type: "textResponseChunk",
      textResponse: groundedCatalogResponse,
      close: true,
      error: false,
      metrics: { grounding: "shopdb_direct" },
    });
    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: groundedCatalogResponse,
        sources,
        type: chatMode,
        attachments,
        metrics: { grounding: "shopdb_direct" },
      },
      threadId: thread?.id || null,
      include: false,
      user,
    });
    return;
  }

  // If in query mode and no context chunks are found from search, backfill, or pins -  do not
  // let the LLM try to hallucinate a response or use general knowledge and exit early
  if (
    chatMode === "query" &&
    contextTexts.length === 0 &&
    !llmCatalog.catalogInjected
  ) {
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
    });

    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        type: chatMode,
        attachments,
      },
      threadId: thread?.id || null,
      include: false,
      user,
    });
    return;
  }

  // Compress & Assemble message to ensure prompt passes token limit with room for response
  // and build system messages based on inputs and history.
  const safeChatHistory = sanitizeOfferKpHistory(chatHistory);
  const safeRawHistory = sanitizeOfferKpHistory(rawHistory);
  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt: await chatPrompt(workspace, user, { conversationMemory }),
      userPrompt: userPromptForLlm,
      contextTexts,
      chatHistory: safeChatHistory,
      attachments,
    },
    safeRawHistory
  );

  // If streaming is not explicitly enabled for connector
  // we do regular waiting of a response and send a single chunk.
  if (LLMConnector.streamingEnabled() !== true) {
    console.log(
      `\x1b[31m[STREAMING DISABLED]\x1b[0m Streaming is not available for ${LLMConnector.constructor.name}. Will use regular chat method.`
    );
    const { textResponse, metrics: performanceMetrics } =
      await LLMConnector.getChatCompletion(messages, {
        temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
        user: user,
      });

    completeText = textResponse;
    try {
      const { sanitizeMetricsForUi } = require("../offerKpApp/teacherLlm");
      metrics = sanitizeMetricsForUi(performanceMetrics, {
        displayModel: workspace?.chatModel || null,
      });
    } catch {
      metrics = performanceMetrics;
    }
    writeResponseChunk(response, {
      uuid,
      sources,
      type: "textResponseChunk",
      textResponse: completeText,
      close: true,
      error: false,
      metrics,
    });
  } else {
    const stream = await LLMConnector.streamGetChatCompletion(messages, {
      temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
      user: user,
    });
    completeText = await LLMConnector.handleStream(response, stream, {
      uuid,
      sources,
    });
    try {
      const { sanitizeMetricsForUi } = require("../offerKpApp/teacherLlm");
      metrics = sanitizeMetricsForUi(stream.metrics, {
        displayModel: workspace?.chatModel || null,
      });
    } catch {
      metrics = stream.metrics;
    }
  }

  const orchestration = await runGenerationPipeline({
    response,
    message: updatedMessage,
    workspace,
    initialText: completeText,
    contextTexts,
    sources,
    externalContexts,
    metrics,
    language,
    // КП contains commercial numbers and table structure. A second LLM pass
    // must never rewrite it after the streamed answer has already been shown.
    skipStylePolish: Boolean(
      shopDbEnrichEnabled() ||
        quoteDocumentRequest ||
        llmCatalog.catalogInjected
    ),
  });
  completeText = orchestration.text;
  sources = orchestration.sources;
  const cost = estimateChatCost(metrics);
  metrics = { ...(metrics || {}), cost };
  // Teacher OpenRouter stays in ragTrace only — never leak OR model id into UI metrics.
  try {
    const { sanitizeMetricsForUi } = require("../offerKpApp/teacherLlm");
    metrics = sanitizeMetricsForUi(metrics, {
      displayModel:
        ragTrace?.teacher?.displayModel || workspace?.chatModel || null,
    });
  } catch {
    /* ignore */
  }

  const externalLinks = buildExternalLinksSection(sources);
  if (externalLinks) {
    writeResponseChunk(response, {
      uuid,
      sources,
      type: "textResponseChunk",
      textResponse: externalLinks,
      close: false,
      error: false,
    });
  }

  // КП: карточки файлов после текста ответа (кнопки Preview / Download в чате).
  // Для явного запроса КП генерация обязательна даже при нуле совпадений ShopDB:
  // строки без цены сохраняются как «Нет в базе» / «по запросу».
  let quoteOutputs = [];
  if (llmCatalog.catalogInjected || quoteDocumentRequest) {
    try {
      const {
        emitAutoQuoteArtifacts,
      } = require("../offerKp/autoQuoteArtifacts");
      const quoteArtifacts = await emitAutoQuoteArtifacts({
        response,
        uuid,
        message: updatedMessage,
        catalogBlocks: llmCatalog.catalogBlocks || [],
        workspace,
        chatHistory: rawHistory,
        parsedFileTexts,
        inquiryDraft: llmCatalog.inquiryDraft,
      });
      if (quoteArtifacts?.summaryText) {
        completeText = `${completeText || ""}${quoteArtifacts.summaryText}`;
      }
      if (quoteArtifacts?.outputs?.length) {
        quoteOutputs = quoteArtifacts.outputs;
      }
    } catch (e) {
      console.error("[offerKp] auto quote artifacts:", e?.message || e);
    }
  }

  if (completeText?.length > 0) {
    const { chat } = await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: completeText,
        sources,
        type: chatMode,
        attachments,
        metrics,
        ragTrace,
        ...(quoteOutputs.length ? { outputs: quoteOutputs } : {}),
      },
      threadId: thread?.id || null,
      user,
    });

    // Finalize immediately after artifacts so the UI stops "hanging" on the
    // last token while follow-up LLM suggestions are still generating.
    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
      metrics,
      ...(quoteOutputs.length ? { outputs: quoteOutputs } : {}),
    });

    if (thread?.id) {
      try {
        const {
          emitThreadFollowUpSuggestions,
        } = require("./threadFollowUpSuggestions");
        await emitThreadFollowUpSuggestions({
          response,
          uuid,
          workspace,
          user,
          thread,
          prompt: message,
          assistantText: completeText,
          chatHistory: rawHistory,
          language,
          catalogInjected: Boolean(llmCatalog.catalogInjected),
        });
      } catch (e) {
        console.warn("[threadFollowUp] stream:", e?.message || e);
      }
    }
    return;
  }

  writeResponseChunk(response, {
    uuid,
    type: "finalizeResponseStream",
    close: true,
    error: false,
    metrics,
  });
  return;
}

module.exports = {
  VALID_CHAT_MODE,
  streamChatWithWorkspace,
};
