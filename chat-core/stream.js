const { v4: uuidv4 } = require("uuid");
const { DocumentManager } = require("../DocumentManager");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { WorkspaceParsedFiles } = require("../../models/workspaceParsedFiles");
const { getVectorDbClass, getLLMProvider } = require("../helpers");
const {
  writeResponseChunk,
  runChatPostProcessWithKeepalive,
} = require("../helpers/chat/responses");
const { grepAgents } = require("./agents");
const {
  grepCommand,
  VALID_COMMANDS,
  chatPrompt,
  recentChatHistory,
  sourceIdentifier,
} = require("./index");
const { getShopDbContext, shopDbEnrichEnabled } = require("../shopDb/enrich");
const {
  buildExternalLinksSection,
  sourcesForResponse,
} = require("./externalLinksSection");
const {
  buildRagTrace,
  garantFlagsFromEnrichResult,
} = require("./ragTrace");
const { applyRussianStylePolish } = require("./russianStylePolish");
const { applyYandexFactCheck } = require("./yandexFactCheck");
const {
  applyOpenRouterGarantFactCheck,
} = require("./openRouterGarantFactCheck");
const { getUsdToRub } = require("../exchangeRate");

// Стрим держит HTTP-соединение до конца генерации — при долгой генерации LLM выход/логаут
// в той же сессии может быть недоступен. Для полноценной асинхронности (очередь + опрос по jobId)
// нужен отдельный поток: POST возвращает 202 + jobId, клиент стримит по GET /chat/stream/:jobId.
const VALID_CHAT_MODE = ["chat", "query"];

function logStep(step, detail, msFromStart) {
  const t = msFromStart != null ? ` +${msFromStart}ms` : "";
  console.log(`[stream] ${step}${detail ? ` ${detail}` : ""}${t}`);
}

async function streamChatWithWorkspace(
  response,
  workspace,
  message,
  chatMode = "chat",
  user = null,
  thread = null,
  attachments = [],
  options = {}
) {
  const webSearchEnrichEnabled = options?.webSearchEnrichEnabled !== false;
  const t0 = Date.now();
  const uuid = uuidv4();
  logStep("1/12 start", `mode=${chatMode}`, 0);

  const updatedMessage = await grepCommand(message, user);
  logStep("2/12 grepCommand done", "", Date.now() - t0);

  if (Object.keys(VALID_COMMANDS).includes(updatedMessage)) {
    const data = await VALID_COMMANDS[updatedMessage](
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
  });
  if (isAgentChat) return;

  const LLMConnector = getLLMProvider({
    provider: workspace?.chatProvider,
    model: workspace?.chatModel,
  });
  const VectorDb = getVectorDbClass();
  logStep("3/12 LLM+VectorDb init", `${LLMConnector?.constructor?.name || "?"}`, Date.now() - t0);

  const messageLimit = workspace?.openAiHistory || 20;
  const hasVectorizedSpace = await VectorDb.hasNamespace(workspace.slug);
  const embeddingsCount = await VectorDb.namespaceCount(workspace.slug);
  logStep("4/12 namespace check", `hasNS=${!!hasVectorizedSpace} embeddings=${embeddingsCount}`, Date.now() - t0);

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
  });
  logStep("5/12 recentChatHistory done", `history=${rawHistory?.length ?? 0}`, Date.now() - t0);

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
  logStep("6/12 pinnedDocs done", `pinned=${pinnedDocIdentifiers.length}`, Date.now() - t0);

  // Inject any parsed files for this workspace/thread/user
  const parsedFiles = await WorkspaceParsedFiles.getContextFiles(
    workspace,
    thread || null,
    user || null
  );
  logStep("7/12 parsedFiles done", `files=${parsedFiles?.length ?? 0}`, Date.now() - t0);
  parsedFiles.forEach((doc) => {
    const { pageContent, ...metadata } = doc;
    contextTexts.push(doc.pageContent);
    sources.push({
      text:
        pageContent.slice(0, 1_000) + "...continued on in source document...",
      ...metadata,
    });
  });

  const vecStart = Date.now();
  const vectorSearchResults =
    embeddingsCount !== 0
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
  logStep("8/12 vectorSearch done", `in ${Date.now() - vecStart}ms`, Date.now() - t0);

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
  contextTexts = [...contextTexts, ...(filledSources?.contextTexts || [])];
  sources = [...sources, ...vectorSearchResults.sources];
  logStep("9/12 fillSourceWindow done", `contextBlocks=${contextTexts?.length ?? 0}`, Date.now() - t0);

  // Enrich: каталог MySQL (purolat.com).
  if (updatedMessage?.trim() && shopDbEnrichEnabled()) {
    const shopResult = await getShopDbContext(updatedMessage, {
      maxDocs: 5,
      chatHistory: rawHistory,
    }).catch((err) => {
      console.warn("[ShopDB] enrich failed:", err?.message || err);
      return { contextTexts: [], sources: [], flags: { shopDbError: true } };
    });
    garantEnrichFlags = shopResult.flags || {};
    const shopContextTexts = shopResult.contextTexts || [];
    const shopSources = shopResult.sources || [];
    if (shopContextTexts.length) {
      contextTexts = [...shopContextTexts, ...contextTexts];
    }
    if (shopSources.length) {
      sources = [...shopSources, ...sources];
    }
    logStep(
      "10/12 ShopDB enrich done",
      `chunks=${shopContextTexts.length}`,
      Date.now() - t0
    );
  } else {
    logStep("10/12 ShopDB skip", "(off or empty message)", Date.now() - t0);
  }

  // If in query mode and no context chunks are found from search, backfill, or pins -  do not
  // let the LLM try to hallucinate a response or use general knowledge and exit early
  if (chatMode === "query" && (!contextTexts || contextTexts.length === 0)) {
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
      user,
    });
    return;
  }

  const responseSources = sourcesForResponse(sources);

  // Compress & Assemble message to ensure prompt passes token limit with room for response
  const compressStart = Date.now();
  logStep("11/12 compressMessages start", `contextBlocks=${contextTexts?.length ?? 0}`, Date.now() - t0);
  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt: await chatPrompt(workspace, user),
      userPrompt: updatedMessage,
      contextTexts,
      sources,
      chatHistory,
      attachments,
    },
    rawHistory
  );
  logStep("11/12 compressMessages done", `${Date.now() - compressStart}ms, messages=${messages?.length ?? 0}`, Date.now() - t0);

  // If streaming is not explicitly enabled for connector
  // we do regular waiting of a response and send a single chunk.
  let usedTokenStreaming = false;
  if (LLMConnector.streamingEnabled() !== true) {
    logStep("12/12 LLM getChatCompletion start", "(no stream)", Date.now() - t0);
    const getStart = Date.now();
    const { textResponse, metrics: performanceMetrics } =
      await LLMConnector.getChatCompletion(messages, {
        temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
        user: user,
      });
    logStep("12/12 LLM getChatCompletion done", `${Date.now() - getStart}ms`, Date.now() - t0);
    completeText = textResponse;
    metrics = performanceMetrics;
    const post0 = Date.now();
    logStep("12a-c/12 postProcess", "start (keepalive on)", Date.now() - t0);
    completeText = await runChatPostProcessWithKeepalive(response, async () => {
      const factStart = Date.now();
      logStep(
        "12a/12 postProcess",
        "yandexFactCheck start",
        Date.now() - t0
      );
      let t = await applyYandexFactCheck(
        completeText || "",
        contextTexts || []
      );
      logStep(
        "12a/12 postProcess",
        `yandexFactCheck done ${Date.now() - factStart}ms, outLen=${(t?.length ?? 0)}`,
        Date.now() - t0
      );
      const orStart = Date.now();
      logStep(
        "12b/12 postProcess",
        "openRouterGarantFactCheck start",
        Date.now() - t0
      );
      t = await applyOpenRouterGarantFactCheck(t || "", contextTexts || []);
      logStep(
        "12b/12 postProcess",
        `openRouterGarantFactCheck done ${Date.now() - orStart}ms, outLen=${(t?.length ?? 0)}`,
        Date.now() - t0
      );
      const polishStart = Date.now();
      logStep(
        "12c/12 postProcess",
        "russianStylePolish (Alice/OpenRouter) start",
        Date.now() - t0
      );
      t = await applyRussianStylePolish(t || "");
      logStep(
        "12c/12 postProcess",
        `russianStylePolish done ${Date.now() - polishStart}ms, outLen=${(t?.length ?? 0)}`,
        Date.now() - t0
      );
      return t;
    });
    logStep(
      "12/12 postProcess",
      `total ${Date.now() - post0}ms`,
      Date.now() - t0
    );
    writeResponseChunk(response, {
      uuid,
      sources: responseSources,
      type: "textResponseChunk",
      textResponse: completeText,
      close: true,
      error: false,
      metrics,
    });
    logStep("done", `total ${Date.now() - t0}ms (no stream)`, Date.now() - t0);
  } else {
    usedTokenStreaming = true;
    const streamStart = Date.now();
    logStep("12/12 LLM stream start", "", Date.now() - t0);
    const stream = await LLMConnector.streamGetChatCompletion(messages, {
      temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
      user: user,
    });
    logStep("12/12 LLM stream connected", `firstChunk in ${Date.now() - streamStart}ms`, Date.now() - t0);
    const handleStart = Date.now();
    completeText = await LLMConnector.handleStream(response, stream, {
      uuid,
      sources: responseSources,
    });
    logStep("12/12 LLM handleStream done", `${Date.now() - handleStart}ms totalStream, ${(completeText?.length ?? 0)} chars`, Date.now() - t0);
    metrics = stream.metrics;
    const rawStreamed = completeText;
    const post0 = Date.now();
    logStep("12a-c/12 postProcess", "start (keepalive on)", Date.now() - t0);
    completeText = await runChatPostProcessWithKeepalive(response, async () => {
      const factStart = Date.now();
      logStep(
        "12a/12 postProcess",
        "yandexFactCheck start",
        Date.now() - t0
      );
      let t = await applyYandexFactCheck(
        completeText || "",
        contextTexts || []
      );
      logStep(
        "12a/12 postProcess",
        `yandexFactCheck done ${Date.now() - factStart}ms, outLen=${(t?.length ?? 0)}`,
        Date.now() - t0
      );
      const orStart = Date.now();
      logStep(
        "12b/12 postProcess",
        "openRouterGarantFactCheck start",
        Date.now() - t0
      );
      t = await applyOpenRouterGarantFactCheck(t || "", contextTexts || []);
      logStep(
        "12b/12 postProcess",
        `openRouterGarantFactCheck done ${Date.now() - orStart}ms, outLen=${(t?.length ?? 0)}`,
        Date.now() - t0
      );
      const polishStart = Date.now();
      logStep(
        "12c/12 postProcess",
        "russianStylePolish (Alice/OpenRouter) start",
        Date.now() - t0
      );
      t = await applyRussianStylePolish(t || "");
      logStep(
        "12c/12 postProcess",
        `russianStylePolish done ${Date.now() - polishStart}ms, outLen=${(t?.length ?? 0)}`,
        Date.now() - t0
      );
      return t;
    });
    logStep(
      "12/12 postProcess",
      `total ${Date.now() - post0}ms`,
      Date.now() - t0
    );
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
  logStep("done", `total ${Date.now() - t0}ms`, Date.now() - t0);

  // --- Cost calculation ---
  const usdToRub = await getUsdToRub().catch(() => null);
  if (metrics && usdToRub) metrics.usdToRub = usdToRub;

  // OpenRouter: pricing per token from cache
  if (metrics && typeof LLMConnector.getModelPricing === "function") {
    const pricing = LLMConnector.getModelPricing();
    if (pricing) {
      const costUsd =
        (metrics.prompt_tokens || 0) * pricing.promptPricePerToken +
        (metrics.completion_tokens || 0) * pricing.completionPricePerToken;
      metrics.costUsd = costUsd;
      if (usdToRub) metrics.costRub = costUsd * usdToRub;
    }
  }
  // GARANT: 7000₽ per 3000 calls (1 search + N topic fetches per request)
  if (metrics) {
    const f = garantEnrichFlags || {};
    let garantApiCalls = 0;
    if (
      !f.garantTokenMissing &&
      !f.garantSkippedNoMessage &&
      !f.garantEnrichError
    ) {
      if (f.garantTimeout) {
        garantApiCalls = 1;
      } else {
        garantApiCalls = 1 + (f.garantDocCount || 0);
      }
    }
    metrics.garantApiCalls = garantApiCalls;
    metrics.garantCostRub = garantApiCalls * (7000 / 3000);
    if (usdToRub && garantApiCalls > 0)
      metrics.garantCostUsd = metrics.garantCostRub / usdToRub;
  }
  // --- End cost calculation ---

  if (completeText?.length > 0) {
    const externalLinks = buildExternalLinksSection(sources);
    const finalText = completeText + externalLinks;
    if (externalLinks) {
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
        attachments,
        metrics,
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
      user,
    });

    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
      metrics,
    });
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
