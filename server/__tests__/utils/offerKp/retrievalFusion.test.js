const {
  reciprocalRankFusion,
  mergeCandidateMeta,
} = require("../../../utils/offerKp/retrievalFusion");

describe("retrievalFusion", () => {
  it("merges independent ranked lists with RRF", () => {
    const dense = [
      { id: 10, name: "dense-top" },
      { id: 20, name: "dense-2" },
    ];
    const lexical = [
      { id: 20, name: "lex-top" },
      { id: 30, name: "lex-2" },
    ];
    const fused = reciprocalRankFusion([dense, lexical], { k: 60 });
    expect(fused.map((row) => row.id)).toEqual([20, 10, 30]);
    expect(fused[0]._rrfScore).toBeGreaterThan(fused[1]._rrfScore);
    expect(fused[0].name).toBe("lex-top");
    expect(fused[0]._matchSources || []).toEqual([]);
  });

  it("preserves dense/canonical meta when merging", () => {
    const merged = mergeCandidateMeta(
      { id: 1, _denseSimilarity: 0.91, _matchSources: ["catalog_dense"] },
      { id: 1, _canonicalSimilarity: 0.4, _matchSources: ["canonical_catalog"] }
    );
    expect(merged._denseSimilarity).toBe(0.91);
    expect(merged._canonicalSimilarity).toBe(0.4);
    expect(merged._matchSources).toEqual(
      expect.arrayContaining(["catalog_dense", "canonical_catalog"])
    );
  });

  it("ignores empty lists", () => {
    expect(reciprocalRankFusion([[], null, [{ id: 7 }]]).map((r) => r.id)).toEqual([
      7,
    ]);
  });
});
