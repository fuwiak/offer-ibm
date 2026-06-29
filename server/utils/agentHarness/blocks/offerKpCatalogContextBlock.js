const { BaseBlock } = require("../BaseBlock");
const {
  enrichUserPromptWithShopCatalog,
  hasCatalogBlocks,
  extractCatalogBlocksFromText,
} = require("../../offerKp/catalogPrompt");

/**
 * Гарантирует, что агент видит каталог в user prompt и не отрицает его наличие.
 */
class OfferKpCatalogContextBlock extends BaseBlock {
  constructor() {
    super("offerKp-catalog-context");
  }

  async install(harness) {
    const invocation = harness.ctx.invocation;
    const workspace = harness.ctx.workspace;
    if (!workspace?.id) return;

    const prompt = String(invocation?.prompt || "")
      .replace(/^@agent\s*/i, "")
      .trim() ||
      String(harness.aibitat?._chats?.at(-1)?.content || "").trim();
    if (!prompt) return;

    const enriched = await enrichUserPromptWithShopCatalog(prompt, {
      workspace,
      userId: invocation?.user_id ?? null,
      threadId: invocation?.thread_id ?? null,
      maxDocs: harness.state.get("catalogMaxDocs") || 5,
      agentMode: true,
    });

    const injected = hasCatalogBlocks(
      extractCatalogBlocksFromText(enriched)
    );
    if (!injected) return;

    harness.state.set("catalogInjected", true);
    const existing = harness.state.get("contextGuidelines") || [];
    harness.state.set("contextGuidelines", [
      ...existing,
      "В текущем сообщении пользователя уже есть блоки [Каталог · purolat.com] с ценами и наличием — используй их для КП. Не пиши, что каталог не передан.",
    ]);

    harness.log("catalog context confirmed for agent", {
      promptLen: enriched.length,
    });
  }
}

module.exports = { OfferKpCatalogContextBlock };
