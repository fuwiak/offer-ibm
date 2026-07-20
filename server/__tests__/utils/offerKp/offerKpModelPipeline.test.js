/* eslint-env jest, node */

const {
  resolvePipelineModel,
  resolvePipelineVisionModel,
  resolvePipelineAgentModel,
  resolvePipelineAgentContext,
  normalizePipelineStage,
  DEFAULT_VISION_MODEL,
  DEFAULT_AGENT_MODEL,
} = require("../../../utils/offerKp/offerKpModelPipeline");
const {
  extractJsonArray,
  inquiryTextFromOcrJsonLines,
  normalizeVisionOcrResponse,
} = require("../../../utils/offerKp/offerKpVisionOcr");

describe("offerKpModelPipeline", () => {
  const prev = {};

  beforeEach(() => {
    for (const key of [
      "OFFER_KP_PIPELINE_VISION_MODEL",
      "OFFER_KP_PIPELINE_AGENT_MODEL",
      "OFFER_KP_PIPELINE_AGENT_CONTEXT",
      "LMSTUDIO_MODEL_PREF",
    ]) {
      prev[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("resolves eyes vs brain stages", () => {
    expect(resolvePipelineModel("vision")).toEqual({
      stage: "vision",
      modelId: DEFAULT_VISION_MODEL,
      role: "eyes",
    });
    expect(resolvePipelineModel("agent").modelId).toBe(DEFAULT_AGENT_MODEL);
    expect(resolvePipelineModel("agent").role).toBe("brain");
    expect(resolvePipelineModel("agent").contextLength).toBe(32768);
  });

  it("normalizes switch aliases for fast GPU swap", () => {
    expect(normalizePipelineStage("eyes")).toBe("vision");
    expect(normalizePipelineStage("oczy")).toBe("vision");
    expect(normalizePipelineStage("brain")).toBe("agent");
    expect(normalizePipelineStage("unload")).toBe("unload");
    expect(resolvePipelineModel("eyes").role).toBe("eyes");
    expect(resolvePipelineModel("brain").role).toBe("brain");
    expect(resolvePipelineModel("unload")).toEqual({
      stage: "unload",
      modelId: "",
      role: "idle",
    });
  });

  it("honors env overrides", () => {
    process.env.OFFER_KP_PIPELINE_VISION_MODEL = "qwen/qwen3-vl-8b-thinking";
    process.env.OFFER_KP_PIPELINE_AGENT_MODEL = "openai/gpt-oss-20b";
    process.env.OFFER_KP_PIPELINE_AGENT_CONTEXT = "4096";
    expect(resolvePipelineVisionModel()).toBe("qwen/qwen3-vl-8b-thinking");
    expect(resolvePipelineAgentModel()).toBe("openai/gpt-oss-20b");
    expect(resolvePipelineAgentContext("openai/gpt-oss-20b")).toBe(4096);
  });
});

describe("vision OCR JSON normalize", () => {
  it("parses JSON array from model output", () => {
    const raw = `\`\`\`json
[{"name":"Болт DIN 933 M8x40","qty":100,"unit":"шт","din":"933","gost":null,"notes":""}]
\`\`\``;
    const lines = extractJsonArray(raw);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toMatch(/DIN 933/);
  });

  it("converts JSON lines to inquiry text without prices", () => {
    const text = inquiryTextFromOcrJsonLines([
      { name: "Гайка DIN 934 M8", qty: 50, unit: "шт", din: "934" },
    ]);
    expect(text).toContain("Гайка DIN 934 M8");
    expect(text).toContain("50 шт");
    expect(text).not.toMatch(/цена|price|RUB/i);
  });

  it("falls back to plain text when JSON missing", () => {
    const normalized = normalizeVisionOcrResponse(
      "1. Болт DIN 933 M8x40 — 10 шт"
    );
    expect(normalized.format).toBe("text");
    expect(normalized.text).toContain("Болт DIN 933");
  });
});
