import { v4 } from "uuid";
import { THREAD_RENAME_EVENT } from "@/components/Sidebar/ActiveWorkspaces/ThreadContainer";
import { emitAssistantMessageCompleteEvent } from "@/components/contexts/TTSProvider";
import { isHiddenAgentStatusMessage } from "@/utils/offerKp/threadPanelAccess";
import { OFFER_KP_QUOTE_PANEL_EVENT } from "@/utils/offerKp/quotePanelEvents";
import { OFFER_KP_QUOTE_FILES_EVENT } from "@/utils/offerKp/quoteFileEvents";
import { dispatchThreadFollowUps } from "@/utils/offerKp/threadFollowUpEvents";
import { clearThreadFollowUpSuggestions } from "@/utils/offerKp/threadMeta";

export const ABORT_STREAM_EVENT = "abort-chat-stream";
export { clearThreadFollowUpOnSend };

function clearThreadFollowUpOnSend(workspaceSlug, threadSlug) {
  if (!workspaceSlug || !threadSlug) return;
  clearThreadFollowUpSuggestions(workspaceSlug, threadSlug);
  dispatchThreadFollowUps({ workspaceSlug, threadSlug, suggestions: [] });
}

function streamChunkText(value) {
  return value == null ? "" : String(value);
}

function outputTypeForPayload(payload = {}) {
  const name = payload.filename || payload.storageFilename || "";
  return /\.pdf$/i.test(name) ? "PdfFileDownload" : "DocxFileDownload";
}

function appendOutputToAssistant(history, payload) {
  if (!payload?.storageFilename) return;
  const output = {
    type: outputTypeForPayload(payload),
    payload,
  };
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== "assistant" || msg.type === "fileDownloadCard") continue;
    const prev = msg.outputs || [];
    if (
      prev.some((o) => o?.payload?.storageFilename === payload.storageFilename)
    ) {
      return;
    }
    history[i] = { ...msg, outputs: [...prev, output] };
    return;
  }
}

// For handling of chat responses in the frontend by their various types.
export default function handleChat(
  chatResult,
  setLoadingResponse,
  setChatHistory,
  remHistory,
  _chatHistory,
  setWebsocket,
  options = {}
) {
  const {
    uuid,
    textResponse,
    type,
    sources = [],
    error,
    close,
    animate = false,
    chatId = null,
    action = null,
    metrics = {},
    suggestions = [],
  } = chatResult;

  const { workspaceSlug = null, threadSlug = null } = options;

  if (type === "threadFollowUpSuggestions") {
    if (workspaceSlug && threadSlug && Array.isArray(suggestions)) {
      dispatchThreadFollowUps({
        workspaceSlug,
        threadSlug,
        suggestions,
        variant: chatResult.variant || "continue",
      });
    }
    return;
  }

  if (
    type === "statusResponse" &&
    isHiddenAgentStatusMessage(textResponse)
  ) {
    setLoadingResponse(false);
    return;
  }

  if (type === "abort" || type === "statusResponse") {
    setLoadingResponse(false);
    setChatHistory([
      ...remHistory,
      {
        type,
        uuid,
        content: textResponse,
        role: "assistant",
        sources,
        closed: true,
        error,
        animate,
        pending: false,
        metrics,
      },
    ]);
    _chatHistory.push({
      type,
      uuid,
      content: textResponse,
      role: "assistant",
      sources,
      closed: true,
      error,
      animate,
      pending: false,
      metrics,
    });
  } else if (type === "textResponse") {
    setLoadingResponse(false);
    setChatHistory([
      ...remHistory,
      {
        uuid,
        content: textResponse,
        role: "assistant",
        sources,
        closed: close,
        error,
        animate: !close,
        pending: false,
        chatId,
        metrics,
      },
    ]);
    _chatHistory.push({
      uuid,
      content: textResponse,
      role: "assistant",
      sources,
      closed: close,
      error,
      animate: !close,
      pending: false,
      chatId,
      metrics,
    });
    emitAssistantMessageCompleteEvent(chatId);
  } else if (
    type === "textResponseChunk" ||
    type === "finalizeResponseStream"
  ) {
    const chatIdx = _chatHistory.findIndex((chat) => chat.uuid === uuid);
    if (chatIdx !== -1) {
      const existingHistory = { ..._chatHistory[chatIdx] };
      let updatedHistory;

      // If the response is finalized, we can set the loading state to false.
      // and append the metrics to the history.
      if (type === "finalizeResponseStream") {
        updatedHistory = {
          ...existingHistory,
          closed: close,
          animate: false,
          pending: false,
          chatId,
          metrics,
          outputs: chatResult.outputs?.length
            ? chatResult.outputs
            : existingHistory.outputs || [],
        };

        _chatHistory[chatIdx - 1] = { ..._chatHistory[chatIdx - 1], chatId }; // update prompt with chatID

        emitAssistantMessageCompleteEvent(chatId);
        setLoadingResponse(false);
      } else {
        updatedHistory = {
          ...existingHistory,
          content: existingHistory.content + streamChunkText(textResponse),
          ...(sources && sources.length > 0 ? { sources } : {}),
          error,
          closed: close,
          animate: !close,
          pending: false,
          chatId,
          metrics,
        };
      }
      _chatHistory[chatIdx] = updatedHistory;
    } else {
      _chatHistory.push({
        uuid,
        sources,
        error,
        content: streamChunkText(textResponse),
        role: "assistant",
        closed: close,
        animate: !close,
        pending: false,
        chatId,
        metrics,
      });
    }
    setChatHistory([..._chatHistory]);
  } else if (type === "fileDownloadCard" && chatResult.content) {
    setLoadingResponse(false);
    appendOutputToAssistant(_chatHistory, chatResult.content);
    window.dispatchEvent(
      new CustomEvent(OFFER_KP_QUOTE_FILES_EVENT, {
        detail: { files: [chatResult.content] },
      })
    );
    setChatHistory([..._chatHistory]);
  } else if (type === "offerKpQuotePanel" && chatResult.content) {
    window.dispatchEvent(
      new CustomEvent(OFFER_KP_QUOTE_PANEL_EVENT, { detail: chatResult.content })
    );
    if (chatResult.content?.generatedFiles?.length) {
      window.dispatchEvent(
        new CustomEvent(OFFER_KP_QUOTE_FILES_EVENT, {
          detail: { files: chatResult.content.generatedFiles },
        })
      );
    }
  } else if (type === "agentInitWebsocketConnection") {
    setWebsocket(chatResult.websocketUUID);
  } else if (type === "stopGeneration") {
    const chatIdx = _chatHistory.length - 1;
    const existingHistory = { ..._chatHistory[chatIdx] };
    const updatedHistory = {
      ...existingHistory,
      sources: [],
      closed: true,
      error: null,
      animate: false,
      pending: false,
      metrics,
    };
    _chatHistory[chatIdx] = updatedHistory;

    setChatHistory([..._chatHistory]);
    setLoadingResponse(false);
  }

  // Action Handling via special 'action' attribute on response.
  if (action === "reset_chat") setChatHistory([]);

  // If thread was updated automatically based on chat prompt
  // then we can handle the updating of the thread here.
  if (action === "rename_thread") {
    if (!!chatResult?.thread?.slug && chatResult.thread.name) {
      window.dispatchEvent(
        new CustomEvent(THREAD_RENAME_EVENT, {
          detail: {
            threadSlug: chatResult.thread.slug,
            newName: chatResult.thread.name,
          },
        })
      );
    }
  }
}

export function getWorkspaceSystemPrompt(workspace) {
  return (
    workspace?.openAiPrompt ??
    "Given the following conversation, relevant context, and a follow up question, reply with an answer to the current question the user is asking. Return only your response to the question given the above information following the users instructions as needed."
  );
}

export function chatQueryRefusalResponse(workspace) {
  return (
    workspace?.queryRefusalResponse ??
    "There is no relevant information in this workspace to answer your query."
  );
}
