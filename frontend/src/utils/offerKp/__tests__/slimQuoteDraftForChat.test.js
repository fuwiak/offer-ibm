import { describe, it, expect } from "vitest";
import {
  isLikelyMultiLineRfq,
  slimQuoteDraftForChat,
  quoteDraftPayloadForChat,
} from "../slimQuoteDraftForChat";

describe("slimQuoteDraftForChat", () => {
  it("detects multi-line RFQ paste", () => {
    const msg = `1. Болт М10х100 ГОСТ 7805-70 — 30 кг
2. Болт М10х20 ГОСТ 7805-70 — 14 кг`;
    expect(isLikelyMultiLineRfq(msg)).toBe(true);
    expect(isLikelyMultiLineRfq("поставь цену 50 на строку 2")).toBe(false);
  });

  it("omits draft payload for multi-line RFQ", () => {
    const draft = {
      hardwareLines: [
        {
          name: "A",
          alternatives: Array.from({ length: 40 }, (_, i) => ({
            sku: `S${i}`,
            name: "alt",
            price: i,
            productUrl: "https://example.com/" + "x".repeat(80),
          })),
        },
      ],
      preview: {
        lines: [{ name: "A", alternatives: [{ sku: "1" }] }],
        subtotal: 0,
      },
    };
    const rfq = `1. Болт М10х100 — 30 кг
2. Болт М6х25 — 3 кг`;
    expect(quoteDraftPayloadForChat(draft, rfq)).toBe(null);
  });

  it("slims alternatives and drops preview.lines duplicate", () => {
    const draft = {
      hardwareLines: [
        {
          name: "Bolt",
          article: "A1",
          alternatives: Array.from({ length: 30 }, (_, i) => ({
            sku: `S${i}`,
            name: "n",
            price: 1,
            productUrl: "https://x/" + i,
            extraJunk: { deep: true },
          })),
        },
      ],
      preview: {
        lines: [{ name: "Bolt", alternatives: [{ sku: "Z" }] }],
        subtotal: 10,
      },
    };
    const slim = slimQuoteDraftForChat(draft);
    expect(slim.hardwareLines[0].alternatives).toHaveLength(15);
    expect(slim.hardwareLines[0].alternatives[0].productUrl).toBeUndefined();
    expect(slim.preview.lines).toBeUndefined();
    expect(slim.preview.subtotal).toBe(10);
  });
});
