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

  it("picks cheaper among similar products", () => {
    const chosen = pickCheaperAmongSimilar([
      { id: 1, name: "Болт DIN 933 M8x40", price: 120 },
      { id: 2, name: "Болт DIN 933 M8x40 оцинк", price: 95 },
      { id: 3, name: "Шпонка 8x7", price: 10 },
    ]);
    expect(chosen.id).toBe(2);
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
