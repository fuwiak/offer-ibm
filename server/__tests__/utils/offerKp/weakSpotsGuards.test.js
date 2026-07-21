"use strict";

const {
  parseProductIdArray,
  parseOcrLinesArray,
} = require("../../../utils/offerKp/llmJsonSchema");
const {
  assessInquiryCompleteness,
} = require("../../../utils/offerKp/inquiryCompleteness");
const {
  resolveReviewReason,
  REVIEW_REASONS,
} = require("../../../utils/offerKp/reviewReasons");
const {
  refreshDraftPricesFromShopDb,
} = require("../../../utils/offerKp/refreshDraftPrices");
const {
  parseLlmProductIds,
  pickClosedCandidateProducts,
  shuffleCandidates,
} = require("../../../utils/offerKp/searchAgent");
const {
  detectRetrieverDisagreement,
} = require("../../../utils/offerKp/matchInquiryLines");

describe("llmJsonSchema", () => {
  it("accepts numeric product id arrays and rejects junk", () => {
    expect(parseProductIdArray([12, "34", 12])).toEqual([12, 34]);
    expect(parseProductIdArray({ sku: "x" })).toEqual([]);
    expect(parseProductIdArray(["not-a-number", -1, 0])).toEqual([]);
  });

  it("validates OCR line arrays and rejects non-arrays", () => {
    expect(
      parseOcrLinesArray([{ name: "Болт M8", qty: 10, unit: "шт" }])
    ).toHaveLength(1);
    expect(parseOcrLinesArray(["plain string row"])).toHaveLength(1);
    expect(parseOcrLinesArray({ name: "nope" })).toBeNull();
  });
});

describe("inquiryCompleteness / minimum information", () => {
  it("flags fastener without size as incomplete", () => {
    const r = assessInquiryCompleteness({ raw: "болт DIN 933 100 шт" });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("size");
  });

  it("flags diameter-only bolt line as missing length", () => {
    const r = assessInquiryCompleteness({ raw: "болт м10 100 шт" });
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it("accepts fully specified fastener", () => {
    const r = assessInquiryCompleteness({
      raw: "болт DIN 933 M10x80 8.8 оцинк 100 шт",
    });
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("accepts SKU-only line", () => {
    const r = assessInquiryCompleteness({
      raw: "Арт. 011144100100097 — 100 шт",
    });
    expect(r.ok).toBe(true);
    expect(r.hasSku).toBe(true);
  });
});

describe("reviewReasons", () => {
  it("maps mismatch and disagreement to structured codes", () => {
    expect(
      resolveReviewReason({
        accepted: false,
        mismatchReason: "size_unconfirmed",
      })
    ).toBe(REVIEW_REASONS.SIZE_UNCONFIRMED);
    expect(
      resolveReviewReason({
        accepted: false,
        retrieverDisagreement: true,
      })
    ).toBe(REVIEW_REASONS.RETRIEVER_DISAGREEMENT);
    expect(
      resolveReviewReason({ accepted: true, hasPrice: true })
    ).toBeNull();
  });
});

describe("refreshDraftPricesFromShopDb (temporal grounding)", () => {
  it("updates exact/analog prices from live stocks and skips similar", async () => {
    const draft = {
      lines: [
        {
          productId: "10",
          matchType: "exact",
          quantity: 2,
          unitPriceNet: 10,
          priceWithVat: 12,
          lineTotal: 20,
        },
        {
          productId: "20",
          matchType: "similar",
          quantity: 1,
          unitPriceNet: 0,
        },
      ],
    };
    const stocks = new Map([
      ["10", { price: 41.25, sku: "SKU10" }],
      ["20", { price: 99, sku: "SKU20" }],
    ]);
    const { draft: next, refreshed, changed } =
      await refreshDraftPricesFromShopDb(draft, async () => stocks);

    expect(refreshed).toBe(2);
    expect(changed).toBe(1);
    expect(next.lines[0].unitPriceNet).toBe(41.25);
    expect(next.lines[0].article).toBe("SKU10");
    expect(next.lines[0].priceRetrievedAt).toBeTruthy();
    // similar must not receive a live price into the quote line
    expect(next.lines[1].unitPriceNet).toBe(0);
  });
});

describe("closed candidate set + order invariance", () => {
  it("parseLlmProductIds drops non-numeric / schema-invalid output", () => {
    expect(parseLlmProductIds('[1, 2, "x", -3]')).toEqual([1, 2]);
    expect(parseLlmProductIds('{"sku":"invented"}')).toEqual([]);
  });

  it("pickClosedCandidateProducts ignores ids outside the set", () => {
    const candidates = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ];
    const picked = pickClosedCandidateProducts(candidates, [2, 999, 1]);
    expect(picked.map((p) => p.id)).toEqual([2, 1]);
  });

  it("candidate-order invariance: same LLM ids → same products regardless of list order", () => {
    const a = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 3, name: "C" },
    ];
    const b = [
      { id: 3, name: "C" },
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ];
    const ids = [2, 1];
    expect(pickClosedCandidateProducts(a, ids).map((p) => p.id)).toEqual(
      pickClosedCandidateProducts(b, ids).map((p) => p.id)
    );
  });

  it("shuffleCandidates returns a permutation of the same ids", () => {
    const list = [1, 2, 3, 4, 5].map((id) => ({ id }));
    const shuffled = shuffleCandidates(list);
    expect(shuffled.map((p) => p.id).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled).not.toBe(list);
  });
});

describe("retriever disagreement", () => {
  it("flags when lexical top-1 differs from embedding top-1", () => {
    const disagreement = detectRetrieverDisagreement([
      { id: 1, _nameSimilarity: 0.9, _embeddingSimilarity: 0.5 },
      { id: 2, _nameSimilarity: 0.4, _embeddingSimilarity: 0.95 },
    ]);
    expect(disagreement).toEqual({
      lexicalProductId: "1",
      embeddingProductId: "2",
    });
  });

  it("returns null when tops agree", () => {
    expect(
      detectRetrieverDisagreement([
        { id: 7, _nameSimilarity: 0.9, _embeddingSimilarity: 0.9 },
        { id: 8, _nameSimilarity: 0.3, _embeddingSimilarity: 0.5 },
      ])
    ).toBeNull();
  });
});
