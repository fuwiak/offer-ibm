"use strict";

describe("matchInquiryToDraft progressive panel", () => {
  it("emits full stub rows first, then fills indexes in place", async () => {
    const {
      matchInquiryToDraft,
      buildPendingDraftLine,
    } = require("../../../utils/offerKp/matchInquiryLines");

    const stub = buildPendingDraftLine({
      raw: "Винт M10x25 – 10 шт.",
      name: "Винт M10x25",
      quantity: 10,
      unit: "шт",
    });
    expect(stub.pendingMatch).toBe(true);
    expect(stub.requestedName).toContain("M10");

    const events = [];
    const matchLine = jest.fn(async (line) => ({
      ...buildPendingDraftLine(line),
      pendingMatch: false,
      matchType: "exact",
      unitPriceNet: 12.5,
      article: "SKU-1",
      productId: "1",
      kpStatus: "Точное соответствие",
      allowPrice: true,
      matchSource: "test",
    }));

    await matchInquiryToDraft(
      ["Винт M10x25 – 10 шт.", "Винт M8x70 – 5 шт."].join("\n"),
      {
        matchLine,
        onProgress: (payload) => events.push(payload),
      }
    );

    expect(events.length).toBeGreaterThanOrEqual(3);
    const first = events[0];
    expect(first.progressStage).toBe("searching");
    expect(first.matchedCount).toBe(0);
    expect(first.quoteDraft.hardwareLines).toHaveLength(2);
    expect(first.quoteDraft.hardwareLines.every((l) => l.pendingMatch)).toBe(
      true
    );

    const lastSearch = [...events]
      .reverse()
      .find((e) => e.progressStage === "searching" && e.matchedCount === 2);
    expect(lastSearch).toBeTruthy();
    expect(lastSearch.quoteDraft.hardwareLines).toHaveLength(2);
    expect(
      lastSearch.quoteDraft.hardwareLines.every((l) => l.matchType === "exact")
    ).toBe(true);

    const done = events[events.length - 1];
    expect(done.progressStage).toBe("matched");
    expect(done.quoteDraft.hardwareLines).toHaveLength(2);
  });
});
