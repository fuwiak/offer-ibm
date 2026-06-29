const { BaseBlock } = require("../BaseBlock");
const {
  QuoteCalculator,
} = require("../../agents/aibitat/plugins/offer-kp/quote-calculator");
const { layerGuidelines } = require("../../../config/offerKp.harnessAntiHallucination");

const CALCULATOR_GUIDELINE =
  "Для колонки «Сумма» в таблице КП вызывай инструмент quote-calculator (quantity × unitPrice). В DOCX/PDF пиши только готовые числа (например 850.80), запрещены формулы =40*21.27 или =10*33.04.";

/**
 * Registers quote-calculator tool for every OfferKP harness run.
 */
class OfferKpQuoteCalculatorBlock extends BaseBlock {
  constructor() {
    super("offerKp-quote-calculator");
  }

  async install(harness) {
    const aibitat = harness.aibitat;
    if (!aibitat) return;

    aibitat.use(QuoteCalculator.plugin());

    const agent = aibitat.agents?.get("@agent");
    if (agent?.functions && !agent.functions.includes(QuoteCalculator.name)) {
      agent.functions.push(QuoteCalculator.name);
    }

    const existing = harness.state.get("contextGuidelines") || [];
    const verifyRules = layerGuidelines("verify");
    const merged = [...existing];
    for (const rule of [CALCULATOR_GUIDELINE, ...verifyRules]) {
      if (!merged.includes(rule)) merged.push(rule);
    }
    harness.state.set("contextGuidelines", merged);

    harness.log("quote calculator tool registered for agent");
  }

  async beforeToolApproval(params, harness) {
    if (params.skillName !== QuoteCalculator.name) return null;
    if (!harness.state.get("quoteDocumentRequest")) return null;

    return {
      handled: true,
      approved: true,
      message: "Quote calculator - auto-approved.",
    };
  }
}

module.exports = { OfferKpQuoteCalculatorBlock };
