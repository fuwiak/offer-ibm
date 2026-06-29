const { Gemma12bHarnessPreset } = require("./Gemma12bHarnessPreset");

/** google/gemma-4-12b-qat — QAT-квантизация, чуть меньше контекста. */
class Gemma12bQatHarnessPreset extends Gemma12bHarnessPreset {
  get label() {
    return "gemma-4-12b-qat";
  }

  maxContextChars() {
    return 48_000;
  }

  catalogMaxDocs() {
    return 1;
  }
}

module.exports = { Gemma12bQatHarnessPreset };
