const { BaseBlock } = require("../BaseBlock");
const {
  enrichUserPromptWithShopCatalog,
  hasCatalogBlocks,
  extractCatalogBlocksFromText,
  stripCatalogSection,
} = require("../../offerKp/catalogPrompt");

function isUserChatMessage(message) {
  const from = String(message?.from || message?.role || "")
    .trim()
    .toUpperCase();
  return from === "USER" || from === "HUMAN";
}

/**
 * Гарантирует, что агент видит каталог в user prompt и не отрицает его наличие.
 */
class OfferKpCatalogContextBlock extends BaseBlock {
  constructor() {
    super("offerKp-catalog-context");
  }

  #catalogOptions(harness) {
    const invocation = harness.ctx.invocation || {};
    return {
      workspace: harness.ctx.workspace,
      userId: invocation.user_id ?? null,
      threadId: invocation.thread_id ?? null,
      maxDocs: harness.state.get("catalogMaxDocs") || 5,
      agentMode: true,
    };
  }

  async #enrichPrompt(prompt, harness) {
    const question = stripCatalogSection(prompt);
    if (!question) return prompt;

    const enriched = await enrichUserPromptWithShopCatalog(
      question,
      this.#catalogOptions(harness)
    );
    if (
      hasCatalogBlocks(extractCatalogBlocksFromText(enriched)) &&
      enriched !== prompt
    ) {
      harness.state.set("catalogInjected", true);
    }
    return enriched;
  }

  async #enrichLastUserMessage(harness) {
    const chats = harness.aibitat?._chats;
    if (!Array.isArray(chats) || !chats.length) return false;

    for (let i = chats.length - 1; i >= 0; i--) {
      const entry = chats[i];
      if (!isUserChatMessage(entry)) continue;

      const raw = String(entry.content || "").trim();
      if (!raw) return false;

      const enriched = await this.#enrichPrompt(raw, harness);
      if (enriched !== raw) {
        entry.content = enriched;
        return true;
      }
      return false;
    }

    return false;
  }

  #ensureCatalogGuideline(harness) {
    const marker =
      "В текущем сообщении пользователя уже есть блоки [Каталог · purolat.com] с ценами и наличием — используй их для КП. Не пиши, что каталог не передан.";
    const existing = harness.state.get("contextGuidelines") || [];
    if (existing.includes(marker)) return;
    harness.state.set("contextGuidelines", [...existing, marker]);
  }

  async install(harness) {
    const workspace = harness.ctx.workspace;
    if (!workspace?.id) return;

    const invocation = harness.ctx.invocation;
    const prompt = String(invocation?.prompt || "")
      .replace(/^@agent\s*/i, "")
      .trim() ||
      String(harness.aibitat?._chats?.at(-1)?.content || "").trim();

    if (prompt) {
      const enriched = await this.#enrichPrompt(prompt, harness);
      if (hasCatalogBlocks(extractCatalogBlocksFromText(enriched))) {
        this.#ensureCatalogGuideline(harness);
        harness.log("catalog context confirmed for agent", {
          promptLen: enriched.length,
        });
      }
    }

    const aibitat = harness.aibitat;
    if (!aibitat || typeof aibitat.reply !== "function") return;

    const originalReply = aibitat.reply.bind(aibitat);
    aibitat.reply = async (route) => {
      const injected = await this.#enrichLastUserMessage(harness);
      if (injected) {
        this.#ensureCatalogGuideline(harness);
        harness.log("catalog injected before agent reply");
      }
      return originalReply(route);
    };
  }
}

module.exports = { OfferKpCatalogContextBlock };
