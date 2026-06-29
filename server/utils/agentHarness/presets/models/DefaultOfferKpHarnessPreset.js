const { BaseModelHarnessPreset } = require("../BaseModelHarnessPreset");

/** Fallback для неизвестных / новых моделей LM Studio. */
class DefaultOfferKpHarnessPreset extends BaseModelHarnessPreset {
  get label() {
    return "default";
  }
}

module.exports = { DefaultOfferKpHarnessPreset };
