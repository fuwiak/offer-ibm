const {
  resolveOfferKpBlockIds,
} = require("../registry");
const { getOfferKpHarnessGuidelines } = require("../../../config/offerKp.harnessGuidelines");

/**
 * Базовый пресет harness для одной LLM-модели OfferKP.
 * Наследуйте и переопределяйте blockIds / maxContextChars / extraGuidelines / catalogMaxDocs.
 */
class BaseModelHarnessPreset {
  /** @param {string} modelId */
  constructor(modelId) {
    this.modelId = String(modelId || "").trim();
  }

  /** @returns {string} */
  get label() {
    return this.modelId || "default";
  }

  /** @returns {string[]} */
  blockIds() {
    return resolveOfferKpBlockIds();
  }

  /** @returns {number} */
  maxContextChars() {
    return 120_000;
  }

  /** @returns {number} */
  catalogMaxDocs() {
    return 2;
  }

  /**
   * Дополнительные LLM-инструкции для этой модели.
   * @param {{ quoteDocument?: boolean }} options
   * @returns {string[]}
   */
  extraGuidelines(_options = {}) {
    return [];
  }

  /**
   * Полный список guidelines (общие + модельные).
   * @param {{ quoteDocument?: boolean }} options
   */
  guidelines(options = {}) {
    return [
      ...getOfferKpHarnessGuidelines(options),
      ...this.extraGuidelines(options),
    ];
  }

  /**
   * Вызывается перед install() — положить метаданные в harness.state / ctx.
   * @param {import("../AgentHarness")} harness
   */
  prepare(harness) {
    harness.ctx.modelPreset = this;
    harness.ctx.modelId = this.modelId;
    harness.state.set("modelId", this.modelId);
    harness.state.set("maxContextChars", this.maxContextChars());
    harness.state.set("catalogMaxDocs", this.catalogMaxDocs());
  }
}

module.exports = { BaseModelHarnessPreset };
