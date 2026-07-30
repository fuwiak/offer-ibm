/* eslint-env jest, node */

/**
 * Fine-thread and material regressions found by running
 * test_files/Shopdb_random_100.expected.csv through the live matcher
 * (scripts/eval-golden-matching.cjs): 6 of 8 wrong SKUs came from these.
 */

const {
  parseHardwareQuery,
  normalizeForMatch,
} = require("../../../utils/offerKp/hardwareQuery");
const {
  classifyProductMatch,
  threadMatchesExact,
  STATUS,
} = require("../../../utils/offerKp/analogRules");

describe("fine-thread parsing (M diameter x pitch x length)", () => {
  it("keeps the length of M16x1,5x150 instead of orphaning it", () => {
    const parsed = parseHardwareQuery(
      "Болт DIN  960 M 16x1,5x150 10.9 / ГОСТ 7798-70"
    );
    expect(parsed.thread).toMatchObject({
      size: "16",
      length: "150",
      pitch: "1.5",
    });
    expect(parsed.pitch).toBe("1.5");
  });

  it("normalizes the triple into one token", () => {
    expect(normalizeForMatch("M 16x1,5x150")).toContain("m16x1.5x150");
  });

  it("still parses a plain coarse thread", () => {
    const parsed = parseHardwareQuery("Болт DIN 933 M12x60 8.8 цинк");
    expect(parsed.thread).toMatchObject({ size: "12", length: "60" });
    expect(parsed.thread.pitch).toBeUndefined();
  });
});

describe("threadMatchesExact with a pitch", () => {
  const fine = { size: "16", length: "150", pitch: "1.5" };
  const coarse = { size: "16", length: "150" };

  it("requires the pitch in the candidate name", () => {
    expect(
      threadMatchesExact(normalizeForMatch("Болт DIN 960 M 16x1,5x150"), fine)
    ).toBe(true);
    expect(
      threadMatchesExact(normalizeForMatch("Болт DIN 931 M 16x150"), fine)
    ).toBe(false);
  });

  it("does not let a coarse request match the fine-pitch product", () => {
    expect(
      threadMatchesExact(normalizeForMatch("Болт DIN 960 M 16x1,5x150"), coarse)
    ).toBe(false);
  });
});

describe("classifyProductMatch fine pitch without a length", () => {
  it("abstains when the request is fine pitch and the name is silent", () => {
    const result = classifyProductMatch("Гайка DIN 937 M 36x2 17H оцинк", {
      name: "Гайка DIN  937 M 36 оцинк",
      stockCount: 10,
    });
    expect(result.matchType).toBe("size_unconfirmed");
    expect(result.status).toBe(STATUS.NEEDS_REVIEW);
  });

  it("keeps exact when the named pitch is the standard coarse one", () => {
    const result = classifyProductMatch("Гайка DIN 934 M 10x1,5 оцинк", {
      name: "Гайка DIN  934 M 10 оцинк",
      stockCount: 10,
    });
    expect(result.matchType).toBe("exact");
  });
});

describe("classifyProductMatch material gate", () => {
  it("rejects нерж A2 for a нерж A4 request", () => {
    const result = classifyProductMatch("Шайба DIN 463 M 16 нерж A4", {
      name: "Шайба DIN   463 M 16 нерж A2",
      stockCount: 10,
    });
    expect(result.matchType).toBe("spec_mismatch");
    expect(result.mismatchReason).toBe("material");
  });

  it("rejects a steel candidate for a brass request", () => {
    const result = classifyProductMatch("Винт DIN 84 M 10x80 латунь (MS)", {
      name: "Винт DIN   84 M 10x 80 нерж A2",
      stockCount: 10,
    });
    expect(result.matchType).toBe("spec_mismatch");
    expect(result.mismatchReason).toBe("material");
  });

  it("accepts the same grade", () => {
    const result = classifyProductMatch("Шайба DIN 463 M 16 нерж A4", {
      name: "Шайба DIN   463 M 16 нерж A4 / ~ ГОСТ 13463-77  (25)",
      stockCount: 10,
    });
    expect(result.matchType).toBe("exact");
  });
});
