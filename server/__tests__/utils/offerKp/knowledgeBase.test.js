const {
  selectRelevantKnowledge,
  formatKnowledgeBlock,
  isKnowledgeBaseEnabled,
} = require("../../../utils/offerKp/knowledgeBase");

describe("knowledgeBase", () => {
  it("is enabled by default and loads the checked-in knowledge files", () => {
    expect(isKnowledgeBaseEnabled()).toBe(true);
    const entries = selectRelevantKnowledge({ hasStandardNumber: true });
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.map((e) => e.name)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("DIN"),
        expect.stringContaining("прочности"),
      ])
    );
  });

  it("returns nothing when no trigger signal is active", () => {
    expect(selectRelevantKnowledge({})).toEqual([]);
    expect(selectRelevantKnowledge({ hasStandardNumber: false, analogIntent: false })).toEqual([]);
  });

  it("formats an empty list as an empty string", () => {
    expect(formatKnowledgeBlock([])).toBe("");
  });

  it("formats matched entries with headings", () => {
    const block = formatKnowledgeBlock([
      { name: "Test rule", body: "Body text here." },
    ]);
    expect(block).toContain("### Test rule");
    expect(block).toContain("Body text here.");
  });
});
