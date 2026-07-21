"use strict";

/**
 * Metamorphic tests for the deterministic matching core.
 *
 * Unlike example-based tests (fixed input -> fixed expected output), these
 * assert *relations* between multiple executions — useful exactly where a
 * single "correct" oracle is hard to pin down for every query, but two
 * clearly related queries must not silently collapse to the same answer
 * (sensitivity) or must not diverge on a difference that shouldn't matter
 * (invariance). Runs only in CI/test time — zero production cost.
 */

const { classifyProductMatch } = require("../../../utils/offerKp/analogRules");

const BOLT_933 = {
  name: "Болт DIN 933 M10x80 8.8 оцинкованный",
  stockCount: 5,
};

describe("metamorphic: classifyProductMatch", () => {
  describe("invariance — semantically neutral rewrites must not change the verdict", () => {
    const baseline = classifyProductMatch("болт DIN 933 M10x80", BOLT_933);

    it.each([
      ["word order swapped", "DIN933 m10x80 болт"],
      ["upper/lower case", "БОЛТ din 933 M10X80"],
      ["extra whitespace", "болт   DIN  933   M10x80"],
      ["Cyrillic х instead of Latin x", "болт DIN 933 M10х80"],
    ])("%s", (_label, variant) => {
      const result = classifyProductMatch(variant, BOLT_933);
      expect(result.matchType).toBe(baseline.matchType);
    });
  });

  describe("sensitivity — a critical-attribute change must flip the verdict", () => {
    it("changing the length (80 -> 70) must not still read as exact", () => {
      const baseline = classifyProductMatch("болт DIN 933 M10x80", BOLT_933);
      const changed = classifyProductMatch("болт DIN 933 M10x70", BOLT_933);
      expect(baseline.matchType).toBe("exact");
      expect(changed.matchType).not.toBe("exact");
      expect(changed.matchType).toBe("size_mismatch");
    });

    it("changing the diameter (M10 -> M8) must not still read as exact", () => {
      const baseline = classifyProductMatch("болт DIN 933 M10x80", BOLT_933);
      const changed = classifyProductMatch("болт DIN 933 M8x80", BOLT_933);
      expect(baseline.matchType).toBe("exact");
      expect(changed.matchType).not.toBe("exact");
    });

    it("asking for a different strength class must not still read as exact", () => {
      const baseline = classifyProductMatch("болт DIN 933 M10x80", BOLT_933);
      const changed = classifyProductMatch(
        "болт DIN 933 M10x80 10.9",
        BOLT_933
      );
      expect(baseline.matchType).toBe("exact");
      expect(changed.matchType).toBe("spec_mismatch");
      expect(changed.mismatchReason).toBe("strength_class");
    });

    /**
     * Regression for a real bug this suite caught: parseHardwareQuery's
     * STANDARD_IMPLIES_TYPE union used to add the DIN-implied product type
     * ("болт" for DIN 933) on top of whatever the customer explicitly named,
     * so "гайка DIN 933 M10x80" (nut) against an actual bolt product still
     * passed productTypeMatches on an OR basis — a wrong physical product
     * category quoted as "exact". Fixed in hardwareQuery.js: the implied
     * type only fills in when the customer named no type at all.
     */
    it("asking for a different product type (nut vs bolt) must not still read as exact", () => {
      const baseline = classifyProductMatch("болт DIN 933 M10x80", BOLT_933);
      const changed = classifyProductMatch("гайка DIN 933 M10x80", BOLT_933);
      expect(baseline.matchType).toBe("exact");
      expect(changed.matchType).not.toBe("exact");
      expect(changed.mismatchReason).toBe("product_type");
    });
  });

  describe("abstention — missing information must not be silently guessed", () => {
    it("a query with no thread dimension at all must not resolve to exact", () => {
      const result = classifyProductMatch("болт DIN 933", BOLT_933);
      expect(result.matchType).not.toBe("exact");
      expect(result.matchType).toBe("size_unconfirmed");
    });

    it("a query with no recognizable standard at all must not resolve to exact", () => {
      const result = classifyProductMatch("что-нибудь подходящее", BOLT_933);
      expect(result.matchType).not.toBe("exact");
    });
  });
});
