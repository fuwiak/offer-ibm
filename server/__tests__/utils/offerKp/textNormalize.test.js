const {
  foldHomoglyphs,
  expandSearchTerms,
} = require("../../../utils/offerKp/textNormalize");

describe("textNormalize", () => {
  it("folds common cyrillic letters to latin lookalikes", () => {
    expect(foldHomoglyphs("оцинк")).toBe("ocink");
    expect(foldHomoglyphs("M36")).toBe("m36");
  });

  it("expands thread size variants", () => {
    const variants = expandSearchTerms(["m 36x2000"]);
    expect(variants).toEqual(
      expect.arrayContaining(["m 36x2000", "m36x2000", "m 36 x 2000"])
    );
  });
});
