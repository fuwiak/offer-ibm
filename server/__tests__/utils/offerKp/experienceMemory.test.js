"use strict";

const {
  cosineSimilarity,
  MEMORY_NAMESPACES,
  DEFAULT_EMBEDDING_MODEL,
} = require("../../../utils/offerKp/experienceMemory");

describe("experienceMemory", () => {
  it("keeps task memories in explicit namespaces", () => {
    expect(MEMORY_NAMESPACES.has("intent_memory")).toBe(true);
    expect(MEMORY_NAMESPACES.has("extraction_example_memory")).toBe(true);
    expect(MEMORY_NAMESPACES.has("match_correction_memory")).toBe(true);
    expect(MEMORY_NAMESPACES.has("everything_memory")).toBe(false);
  });

  it("uses the lightweight multilingual OpenRouter embedding by default", () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe("qwen/qwen3-embedding-0.6b");
  });

  it("computes cosine similarity safely", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1], [1, 0])).toBe(0);
  });
});
