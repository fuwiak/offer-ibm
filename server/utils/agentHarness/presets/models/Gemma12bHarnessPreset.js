const { BaseModelHarnessPreset } = require("../BaseModelHarnessPreset");

/** google/gemma-4-12b — сбалансированный локальный preset. */
class Gemma12bHarnessPreset extends BaseModelHarnessPreset {
  get label() {
    return "gemma-4-12b";
  }

  maxContextChars() {
    return 64_000;
  }

  catalogMaxDocs() {
    return 2;
  }

  extraGuidelines() {
    return [
      "Сопоставляй позиции заявки строго с блоками [Каталог · purolat.com]; не копируй названия из PDF без проверки SKU.",
    ];
  }
}

module.exports = { Gemma12bHarnessPreset };
