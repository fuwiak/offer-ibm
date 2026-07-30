"use strict";

/* eslint-env jest, node */

const {
  rerankTop50,
  identityRerankScore,
  isIdentityRival,
} = require("../../../utils/offerKp/matching/top50Rerank");
const { enrichMatchDecision } = require("../../../utils/offerKp/matching");

function alt(overrides = {}) {
  return {
    productId: "1",
    name: "Болт DIN 933 M10x80",
    matchType: "exact",
    price: 10,
    sku: "A",
    stockCount: 5,
    _bm25Score: 5,
    _features: {
      lexicalScore: 0.8,
      embeddingScore: 0.7,
      bm25Score: 5,
      alignmentSim: 0.9,
      typeMatch: 1,
      standardMatch: 1,
      diameterMatch: 1,
      lengthMatch: 1,
      coatingMatch: 0.5,
      strengthMatch: 0.5,
      missingParamCount: 0,
      softViolationCount: 0,
    },
    _ltrScore: 12,
    constraintViolations: [],
    softConstraintViolations: [],
    ...overrides,
  };
}

describe("top50Rerank", () => {
  it("promotes exact size+standard above wrong length despite higher BM25 noise", () => {
    const wrong = alt({
      productId: "2",
      name: "Болт DIN 933 M10x40",
      _bm25Score: 9,
      _ltrScore: 8,
      _features: {
        ...alt()._features,
        bm25Score: 9,
        lengthMatch: 0,
        diameterMatch: 1,
        standardMatch: 1,
      },
    });
    const correct = alt({
      productId: "1",
      _bm25Score: 6,
      _ltrScore: 11,
    });
    const { alternatives, best, identityRival, margin } = rerankTop50([
      wrong,
      correct,
    ]);
    expect(best.productId).toBe("1");
    expect(alternatives[0].productId).toBe("1");
    expect(identityRival.productId).toBe("2");
    expect(margin).toBeGreaterThan(0);
  });

  it("does not treat coating twin as identity rival", () => {
    const plain = alt({ productId: "1", name: "Болт DIN 933 M10x80 8.8" });
    const zinc = alt({
      productId: "2",
      name: "Болт DIN 933 M10x80 8.8 оцинк",
      _bm25Score: 4.5,
      _ltrScore: 11.5,
    });
    const { identityRival, acceptByMargin } = rerankTop50([plain, zinc]);
    expect(identityRival).toBeNull();
    expect(acceptByMargin).toBe(true);
  });

  it("hard conflicts sink below clean candidates", () => {
    const dirty = alt({
      productId: "9",
      constraintViolations: ["diameter_mismatch"],
      _bm25Score: 99,
      _ltrScore: 99,
    });
    const clean = alt({ productId: "1", _bm25Score: 3, _ltrScore: 5 });
    expect(identityRerankScore(dirty)).toBeLessThan(identityRerankScore(clean));
    expect(rerankTop50([dirty, clean]).best.productId).toBe("1");
  });

  it("isIdentityRival detects diameter swap", () => {
    expect(
      isIdentityRival(
        alt({ _features: { ...alt()._features, diameterMatch: 1 } }),
        alt({
          productId: "2",
          _features: { ...alt()._features, diameterMatch: 0 },
        })
      )
    ).toBe(true);
  });
});

describe("enrichMatchDecision + top50 rerank", () => {
  it("ranks correct M×L first and rejects low identity margin", () => {
    const result = enrichMatchDecision({
      queryText: "Болт DIN 933 M10x80",
      alternatives: [
        {
          productId: "1",
          name: "Болт DIN 933 M10x40",
          matchType: "exact",
          price: 8,
          sku: "X",
          stockCount: 3,
          _bm25Score: 8,
        },
        {
          productId: "2",
          name: "Болт DIN 933 M10x80",
          matchType: "exact",
          price: 12,
          sku: "Y",
          stockCount: 5,
          _bm25Score: 6,
        },
      ],
      products: [
        { id: "1", name: "Болт DIN 933 M10x40", _bm25Score: 8 },
        { id: "2", name: "Болт DIN 933 M10x80", _bm25Score: 6 },
      ],
    });
    expect(result.alternatives[0].productId).toBe("2");
    expect(result.rerank?.top10Count).toBeGreaterThan(0);
    expect(result.alternatives[0]._rerankScore).toBeGreaterThan(
      result.alternatives[1]._rerankScore
    );
  });
});
