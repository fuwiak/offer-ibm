const {
  nameSimilarityScore,
  productsAreSimilar,
  pickCheaperAmongSimilar,
  applyCheaperPreferenceAmongSimilar,
  cosineSimilarity,
  tokenize,
} = require("../../../utils/offerKp/nameSimilarity");

describe("nameSimilarity", () => {
  it("tokenizes hardware names", () => {
    expect(tokenize("Болт DIN 933 M8x40")).toEqual(
      expect.arrayContaining(["din", "933", "m8x40"])
    );
  });

  it("scores closer names higher with cosine blend", () => {
    const query = "Болт DIN 933 M8x40 оцинк";
    const close = "Болт DIN 933 M8x40 цинк";
    const far = "Гайка DIN 934 M8";
    expect(nameSimilarityScore(query, close)).toBeGreaterThan(
      nameSimilarityScore(query, far)
    );
  });

  it("detects similar product pairs", () => {
    const a = { name: "Болт DIN 933 M8x40" };
    const b = { name: "Болт DIN 933 M8x40 оцинк" };
    const c = { name: "Шпонка 8x7 ГОСТ 24071" };
    expect(productsAreSimilar(a, b)).toBe(true);
    expect(productsAreSimilar(a, c)).toBe(false);
  });

  it("does not pick cheapest across dissimilar bolt sizes", () => {
    const chosen = pickCheaperAmongSimilar([
      { id: 1, name: "Болт ГОСТ 7805-70 M10x100", price: 45 },
      { id: 2, name: "Болт ГОСТ 7805-70 M6x25", price: 18.5 },
      { id: 3, name: "Болт ГОСТ 7805-70 M8x40", price: 22 },
    ]);
    // First candidate stays — not the cheapest wrong size.
    expect(chosen.id).toBe(1);
  });

  it("reorders tied similar scores toward cheaper item", () => {
    const expensive = { id: 1, name: "Болт DIN 933 M8x40", price: 200 };
    const cheaper = { id: 2, name: "Болт DIN 933 M8x40 оцинк", price: 80 };
    const ordered = applyCheaperPreferenceAmongSimilar([
      { p: expensive, score: 90, index: 0 },
      { p: cheaper, score: 88, index: 1 },
    ]);
    expect(ordered[0].id).toBe(2);
  });

  it("cosineSimilarity returns 1 for identical vectors", () => {
    const vec = { bolt: 0.5, m8: 0.3 };
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
  });
});
