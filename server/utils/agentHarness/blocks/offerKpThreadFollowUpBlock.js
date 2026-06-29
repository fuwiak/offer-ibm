const { BaseBlock } = require("../BaseBlock");
const {
  generateThreadFollowUpSuggestions,
  extractAgentTurnForFollowUps,
  threadFollowUpSuggestionsEnabled,
} = require("../../chats/threadFollowUpSuggestions");

/**
 * After each agent turn (and on session end), refresh recovery-oriented follow-ups for the thread UI.
 */
class OfferKpThreadFollowUpBlock extends BaseBlock {
  constructor() {
    super("offerKp-thread-follow-up");
  }

  async #emitFollowUps(harness, turn) {
    if (!turn?.prompt || !turn?.assistantText) return;

    const invocation = harness.ctx.invocation;
    const workspace = harness.ctx.workspace;
    if (!invocation?.thread_id || !workspace) return;

    let result = { suggestions: [], variant: "continue" };
    try {
      result = await generateThreadFollowUpSuggestions({
        workspace,
        user: invocation.user_id ? { id: invocation.user_id } : null,
        prompt: turn.prompt,
        assistantText: turn.assistantText,
        chatHistory: turn.chatHistory || [],
        catalogInjected: Boolean(harness.state.get("catalogInjected")),
      });
    } catch (error) {
      harness.log("thread follow-up generation failed", {
        error: error?.message || String(error),
      });
      return;
    }

    const { suggestions, variant } = result;
    if (!suggestions.length) return;

    harness.state.set("threadFollowUpSuggestions", suggestions);
    harness.state.set("threadFollowUpVariant", variant);

    const aibitat = harness.aibitat;
    if (typeof aibitat.socket?.send === "function") {
      aibitat.socket.send("threadFollowUpSuggestions", {
        suggestions,
        variant,
      });
    }
  }

  async install(harness) {
    if (!threadFollowUpSuggestionsEnabled()) return;

    const aibitat = harness.aibitat;
    if (!aibitat) return;

    const runForChats = async () => {
      const turn = extractAgentTurnForFollowUps(aibitat._chats);
      await this.#emitFollowUps(harness, turn);
    };

    aibitat.onMessage?.(async (message) => {
      const from = String(message?.from || "").toUpperCase();
      if (from === "USER" || from === "@AGENT") return;
      await runForChats();
    });

    aibitat.onTerminate?.(async () => {
      await runForChats();
    });
  }
}

module.exports = { OfferKpThreadFollowUpBlock };
