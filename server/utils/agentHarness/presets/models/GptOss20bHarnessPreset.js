const { BaseModelHarnessPreset } = require("../BaseModelHarnessPreset");

/** openai/gpt-oss-20b — основная модель, полный контекст. */
class GptOss20bHarnessPreset extends BaseModelHarnessPreset {
  get label() {
    return "gpt-oss-20b";
  }

  maxContextChars() {
    return 120_000;
  }

  catalogMaxDocs() {
    return 2;
  }
}

module.exports = { GptOss20bHarnessPreset };
