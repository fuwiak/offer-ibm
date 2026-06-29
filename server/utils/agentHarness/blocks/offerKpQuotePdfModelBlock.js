const { BaseBlock } = require("../BaseBlock");
const { applyHarnessModelSwitch } = require("../applyModelSwitch");
const {
  resolveQuotePdfModelSwitch,
  quotePdfModelAutoSwitchEnabled,
} = require("../../offerKp/quotePdfModelRouter");
const { WorkspaceParsedFiles } = require("../../../models/workspaceParsedFiles");

/**
 * При запросе КП с прикреплённым PDF переключает модель на preset,
 * лучше читающий позиции и цены из заявки (если текущая модель «слабая»).
 */
class OfferKpQuotePdfModelBlock extends BaseBlock {
  constructor() {
    super("offerKp-quote-pdf-model");
  }

  async install(harness) {
    if (!quotePdfModelAutoSwitchEnabled()) return;

    const workspace = harness.ctx.workspace;
    const invocation = harness.ctx.invocation;
    if (!workspace?.id) return;

    const prompt =
      String(invocation?.prompt || "").trim() ||
      String(harness.aibitat?._chats?.at(-1)?.content || "").trim();
    if (!prompt) return;

    const threadId = invocation?.thread_id || null;
    const userId = invocation?.user_id || null;

    let parsedFiles = [];
    try {
      parsedFiles = await WorkspaceParsedFiles.getContextFiles(
        workspace,
        threadId ? { id: threadId } : null,
        userId ? { id: userId } : null
      );
    } catch {
      parsedFiles = [];
    }

    const parsedFileTexts = parsedFiles
      .map((doc) => doc.pageContent)
      .filter(Boolean);

    const modelSwitch = resolveQuotePdfModelSwitch({
      message: prompt,
      workspace,
      parsedFiles,
      parsedFileTexts,
    });
    if (!modelSwitch) return;

    applyHarnessModelSwitch(harness, modelSwitch.model, modelSwitch);

    harness.log("quote PDF model auto-switch for agent", {
      from: modelSwitch.from,
      to: modelSwitch.model,
    });
  }
}

module.exports = { OfferKpQuotePdfModelBlock };
