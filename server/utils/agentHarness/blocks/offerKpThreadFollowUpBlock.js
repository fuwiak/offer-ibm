const { BaseBlock } = require("../BaseBlock");
const {
  generateThreadFollowUpSuggestions,
  threadFollowUpSuggestionsEnabled,
} = require("../../chats/threadFollowUpSuggestions");

/**
 * After each agent turn, refresh LLM follow-up questions for the thread UI
 * (ChatGPT / Perplexity style). Emits via aibitat.socket when available.
 */
class OfferKpThreadFollowUpBlock extends BaseBlock {
  constructor() {
    super("offerKp-thread-follow-up");
  }

  async afterTurn({ message } = {}, harness) {
    if (!threadFollowUpSuggestionsEnabled()) return;
    const invocation = harness.ctx.invocation;
    if (!invocation?.thread_id) return;

    const aibitat = harness.aibitat;
    const chats = Array.isArray(aibitat?._chats) ? aibitat._chats : [];
    if (chats.length < 2) return;

    const last = chats[chats.length - 1];
    const prev = chats[chats.length - 2];
    if (prev?.from !== "USER" || last?.from === "USER") return;

    const prompt = String(prev.content || "").replace(/^@agent:\s*/i, "").trim();
    const assistantText = String(last.content || message?.content || "").trim();
    if (!prompt || !assistantText) return;

    const workspace = harness.ctx.workspace;
    if (!workspace) return;

    const chatHistory = chats.slice(0, -2).map((entry) => ({
      role: entry.from === "USER" ? "user" : "assistant",
      content: String(entry.content || ""),
    }));

    let suggestions = [];
    try {
      suggestions = await generateThreadFollowUpSuggestions({
        workspace,
        user: invocation.user_id ? { id: invocation.user_id } : null,
        prompt,
        assistantText,
        chatHistory,
      });
    } catch (error) {
      harness.log("thread follow-up generation failed", {
        error: error?.message || String(error),
      });
      return;
    }

    if (!suggestions.length) return;

    harness.state.set("threadFollowUpSuggestions", suggestions);

    if (typeof aibitat.socket?.send === "function") {
      aibitat.socket.send("threadFollowUpSuggestions", { suggestions });
    }
  }
}

module.exports = { OfferKpThreadFollowUpBlock };
