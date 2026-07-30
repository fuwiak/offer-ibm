"use strict";

const {
  draftTotal,
  resolveDraftReadCommand,
} = require("../../../utils/offerKp/draftReadCommands");

describe("draftReadCommands", () => {
  const quoteDraft = {
    currency: "RUB",
    hardwareLines: [
      { quantity: 2, unitPriceNet: 50, lineTotal: 100 },
      { quantity: 3, unitPriceNet: 25, lineTotal: 75 },
    ],
  };

  it("answers the generated Russian total follow-up from the current draft", () => {
    const result = resolveDraftReadCommand({
      command: "quote_get_total",
      message: "Какова общая сумма заказа по текущему списку?",
      quoteDraft,
    });
    expect(result.text).toBe("Общая сумма по текущему списку: 175,00 RUB.");
    expect(result.total).toBe(175);
  });

  it("computes a total when lineTotal is absent", () => {
    expect(
      draftTotal({ hardwareLines: [{ quantity: 4, unitPriceNet: 12.5 }] })
    ).toBe(50);
  });

  it("returns a normal answer instead of throwing when no draft exists", () => {
    expect(
      resolveDraftReadCommand({
        command: "quote_get_total",
        message: "Какова общая сумма?",
        quoteDraft: null,
      }).text
    ).toBe("Текущий список позиций пока не сформирован.");
  });
});
