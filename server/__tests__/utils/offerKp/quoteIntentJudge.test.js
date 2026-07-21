const {
  payloadLooksLikeQuote,
  detectQuoteCreationIntentSync,
  extractRecentUserMessages,
  parseYesNo,
} = require("../../../utils/offerKp/quoteIntentJudge");

describe("quoteIntentJudge", () => {
  describe("payloadLooksLikeQuote", () => {
    it("recognizes KP title and filename", () => {
      expect(
        payloadLooksLikeQuote({
          payload: {
            filename: "Kp_Anker_Bolts.docx",
            title: "Коммерческое предложение",
          },
        })
      ).toBe(true);
    });

    it("recognizes markdown quote table in content", () => {
      expect(
        payloadLooksLikeQuote({
          payload: {
            content:
              "# Коммерческое предложение\n| № | Товар | Цена |\n|---|-------|------|\n| 1 | Болт | 10 |",
          },
        })
      ).toBe(true);
    });
  });

  describe("detectQuoteCreationIntentSync", () => {
    it("detects explicit KP request in Russian", () => {
      expect(
        detectQuoteCreationIntentSync([
          "Подготовь коммерческое предложение по PDF",
        ])
      ).toBe(true);
    });

    it("detects short KP follow-up after prior context", () => {
      expect(
        detectQuoteCreationIntentSync([
          "Нужно КП по анкерам из заявки",
          "да, сделай docx",
        ])
      ).toBe(true);
    });

    it("returns false for unrelated chat", () => {
      expect(detectQuoteCreationIntentSync(["Какая погода в Москве?"])).toBe(
        false
      );
    });

    it("recognizes the Start with KP draft/export phrases", () => {
      expect(
        detectQuoteCreationIntentSync([
          "Сформируй черновик КП по списку позиций из каталога purolat.com",
        ])
      ).toBe(true);
      expect(
        detectQuoteCreationIntentSync([
          "Подготовь КП в PDF/DOCX с таблицей позиций, ценами и статусами",
        ])
      ).toBe(true);
    });

    it("recognizes regeneration of a priced DOCX as quote work", () => {
      expect(
        detectQuoteCreationIntentSync([
          "Почему в КП нет цен? Подставь каталог purolat.com и переделай DOCX с позициями и SKU",
        ])
      ).toBe(true);
    });

    it("does not approve a quote containing a forbidden price instruction", () => {
      expect(
        detectQuoteCreationIntentSync(["Создай КП на гайки, цену придумай сам"])
      ).toBe(false);
    });
  });

  describe("extractRecentUserMessages", () => {
    it("collects USER messages from aibitat chats", () => {
      expect(
        extractRecentUserMessages([
          { from: "USER", content: "первое" },
          { from: "@agent", content: "ответ" },
          { from: "USER", content: "второе" },
        ])
      ).toEqual(["первое", "второе"]);
    });
  });

  describe("parseYesNo", () => {
    it("parses yes/no answers", () => {
      expect(parseYesNo("yes")).toBe(true);
      expect(parseYesNo("no")).toBe(false);
      expect(parseYesNo("да, нужно КП")).toBe(true);
    });
  });
});
