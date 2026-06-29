const { BaseBlock } = require("../BaseBlock");
const { harnessLog } = require("../harnessLog");
const { getOfferKpHarnessGuidelines } = require("../../../config/offerKp.harnessGuidelines");

/**
 * Подставляет расширяемые LLM-инструкции OfferKP (единицы, статус, аналоги, приоритеты DIN/ГОСТ).
 * Новые правила добавляются в server/config/offerKp.harnessGuidelines.js.
 */
class OfferKpCatalogGuidelinesBlock extends BaseBlock {
  constructor() {
    super("offerKp-catalog-guidelines");
  }

  async install(harness) {
    const quoteDocument = Boolean(harness.state.get("quoteDocumentRequest"));
    const guidelines = getOfferKpHarnessGuidelines({ quoteDocument });
    const existing = harness.state.get("contextGuidelines") || [];
    harness.state.set("contextGuidelines", [...existing, ...guidelines]);

    harnessLog("info", "offerKp.catalogGuidelines", {
      count: guidelines.length,
      quoteDocument,
    });
  }
}

module.exports = { OfferKpCatalogGuidelinesBlock };
