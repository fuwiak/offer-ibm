const { BaseBlock } = require("../BaseBlock");
const { harnessLog } = require("../harnessLog");
const {
  getOfferKpHarnessGuidelines,
} = require("../../../config/offerKp.harnessGuidelines");
const {
  layerGuidelines,
} = require("../../../config/offerKp.harnessAntiHallucination");

/**
 * Подставляет расширяемые LLM-инструкции OfferKP (единицы, статус, аналоги, приоритеты DIN/ГОСТ).
 * Модельные overrides — через harness.ctx.modelPreset (BaseModelHarnessPreset).
 */
class OfferKpCatalogGuidelinesBlock extends BaseBlock {
  constructor() {
    super("offerKp-catalog-guidelines");
  }

  async install(harness) {
    if (harness.state.get("strictSourceOnly")) {
      harnessLog("info", "offerKp.catalogGuidelines.skippedSourceOnly", {
        modelId: harness.ctx.modelId || null,
      });
      return;
    }
    const quoteDocument = Boolean(harness.state.get("quoteDocumentRequest"));
    const preset = harness.ctx.modelPreset;
    const guidelines = preset
      ? preset.guidelines({ quoteDocument })
      : getOfferKpHarnessGuidelines({ quoteDocument });
    const antiHallucination = quoteDocument
      ? layerGuidelines("all")
      : layerGuidelines("retrieve").concat(layerGuidelines("constrain"));
    const existing = harness.state.get("contextGuidelines") || [];
    harness.state.set("contextGuidelines", [
      ...existing,
      ...guidelines,
      ...antiHallucination.filter(
        (g) => !existing.includes(g) && !guidelines.includes(g)
      ),
    ]);

    harnessLog("info", "offerKp.catalogGuidelines", {
      count: guidelines.length,
      quoteDocument,
      modelId: harness.ctx.modelId || null,
      preset: preset?.label || null,
    });
  }
}

module.exports = { OfferKpCatalogGuidelinesBlock };
