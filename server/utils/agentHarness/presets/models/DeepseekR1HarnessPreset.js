const { BaseModelHarnessPreset } = require("../BaseModelHarnessPreset");

/** deepseek/deepseek-r1-0528-qwen3-8b — ~32k контекст, лучше отдаёт цены. */
class DeepseekR1HarnessPreset extends BaseModelHarnessPreset {
  get label() {
    return "deepseek-r1";
  }

  maxContextChars() {
    return 32_000;
  }

  catalogMaxDocs() {
    return 1;
  }

  extraGuidelines(options = {}) {
    const lines = [
      "Контекст модели ограничен (~32k токенов): используй только самые релевантные блоки [Каталог · purolat.com].",
      "Приоритет ответа: точные цены, единицы измерения (кг/шт/м) и статус наличия из каталога.",
    ];
    if (options.quoteDocument) {
      lines.push(
        "В таблице КП не пропускай строки — каждая позиция из заявки должна иметь цену или статус «Требует проверки».",
        "Суммы строк считай через quote-calculator; не оставляй =qty*price в таблице."
      );
    }
    return lines;
  }
}

module.exports = { DeepseekR1HarnessPreset };
