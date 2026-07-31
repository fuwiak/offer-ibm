import { describe, it, expect } from "vitest";
import { resolveProductUrl } from "../resolveProductUrl";

describe("resolveProductUrl", () => {
  it("returns absolute productUrl from the line", () => {
    expect(
      resolveProductUrl({
        productUrl: "https://purolat.com/shop/bolty/din-933-m10/",
      })
    ).toBe("https://purolat.com/shop/bolty/din-933-m10/");
  });

  it("falls back to url", () => {
    expect(
      resolveProductUrl({ url: "https://purolat.com/shop/gaiki/din-934/" })
    ).toBe("https://purolat.com/shop/gaiki/din-934/");
  });

  it("rejects relative slugs and fabricated /product/{sku}", () => {
    expect(resolveProductUrl({ productUrl: "shtanga_din_975" })).toBe("");
    expect(
      resolveProductUrl({
        productUrl: "https://purolat.com/product/45104992510700",
      })
    ).toBe("");
    expect(resolveProductUrl({ article: "45104992510700" })).toBe("");
  });
});
