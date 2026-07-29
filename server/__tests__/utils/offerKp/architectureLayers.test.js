"use strict";

const {
  CircuitBreaker,
  getCircuitBreaker,
  resetAllCircuitBreakers,
  withTimeout,
  resilientCall,
  isRetryableError,
} = require("../../../utils/offerKp/connectors/resilientCall");
const {
  buildLineEvidence,
  withLineEvidence,
  PRICE_ELIGIBLE_MATCH_TYPES,
} = require("../../../utils/offerKp/matchEvidence");
const {
  assertExportGuards,
  stripIllegalPrices,
} = require("../../../utils/offerKp/exportGuards");
const {
  createRequestTrace,
  markStage,
  setTraceIntent,
  appendMatchEvidence,
  finalizeTrace,
  summarizeTrace,
} = require("../../../utils/offerKp/requestTrace");
const {
  classifyMatch,
  verifyQuote,
  extractInquiryLines,
} = require("../../../utils/offerKp/quoteTools");
const {
  draftBusinessFingerprint,
  compareDraftFingerprints,
  findForbiddenSkuHits,
  evaluatePipelineStability,
} = require("../../../utils/offerKp/pipelineEval");
const {
  QUOTE_PIPELINE_STAGES,
  runQuotePipeline,
} = require("../../../utils/offerKp/quotePipeline");

describe("resilientCall / circuit breaker", () => {
  beforeEach(() => resetAllCircuitBreakers());

  it("retries then succeeds", async () => {
    let n = 0;
    const result = await resilientCall(
      async () => {
        n += 1;
        if (n < 2) {
          const err = new Error("timeout");
          err.code = "ETIMEDOUT";
          throw err;
        }
        return "ok";
      },
      { name: "t1", timeoutMs: 1000, retries: 2, backoffMs: 1 }
    );
    expect(result).toBe("ok");
    expect(n).toBe(2);
  });

  it("opens circuit after failures", async () => {
    const circuit = getCircuitBreaker("test-open", {
      failureThreshold: 2,
      cooldownMs: 60_000,
    });
    const boom = async () => {
      const err = new Error("down");
      err.code = "ECONNRESET";
      throw err;
    };
    await expect(
      resilientCall(boom, { name: "x", retries: 0, circuit, timeoutMs: 500 })
    ).rejects.toThrow();
    await expect(
      resilientCall(boom, { name: "x", retries: 0, circuit, timeoutMs: 500 })
    ).rejects.toThrow();
    expect(circuit.state).toBe("open");
    await expect(
      resilientCall(boom, { name: "x", retries: 0, circuit, timeoutMs: 500 })
    ).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
  });

  it("withTimeout rejects slow fn", async () => {
    await expect(
      withTimeout(() => new Promise((r) => setTimeout(r, 200)), 30)
    ).rejects.toMatchObject({ code: "ETIMEDOUT" });
  });

  it("isRetryableError recognizes timeouts", () => {
    expect(isRetryableError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isRetryableError({ message: "nope" })).toBe(false);
  });

  it("CircuitBreaker half-opens after cooldown", () => {
    const c = new CircuitBreaker({
      name: "h",
      failureThreshold: 1,
      cooldownMs: 1000,
    });
    c.onFailure();
    expect(c.state).toBe("open");
    c.openedAt = Date.now() - 2000;
    expect(c.canPass()).toBe(true);
    expect(c.state).toBe("half_open");
  });
});

describe("matchEvidence", () => {
  it("builds evidence with price only for exact/analog", () => {
    const exact = buildLineEvidence({
      requestedName: "Болт DIN 933 M10x80",
      productId: "18291",
      article: "SKU-1",
      matchType: "exact",
      unitPriceNet: 41.25,
      retrievedAt: "2026-07-30T00:00:00.000Z",
      matchStrategies: ["structured", "din"],
      allowPrice: true,
    });
    expect(exact.selected_product_id).toBe("18291");
    expect(exact.shopdb_price).toBe(41.25);
    expect(exact.match_sources).toEqual(["structured", "din"]);
    expect(exact.llm_used).toBe(false);

    const similar = buildLineEvidence({
      requestedName: "x",
      matchType: "similar",
      unitPriceNet: 99,
      allowPrice: false,
    });
    expect(similar.shopdb_price).toBeNull();
  });

  it("withLineEvidence attaches evidence object", () => {
    const line = withLineEvidence({
      requestedName: "гайка",
      matchType: "none",
      unitPriceNet: 0,
      allowPrice: false,
    });
    expect(line.evidence.match_type).toBe("none");
  });

  it("PRICE_ELIGIBLE_MATCH_TYPES is exact+analog only", () => {
    expect(PRICE_ELIGIBLE_MATCH_TYPES).toEqual(["exact", "analog"]);
  });
});

describe("exportGuards", () => {
  it("fails when source/quote line counts differ", () => {
    const r = assertExportGuards({
      sourceLines: [{}, {}],
      quoteLines: [{}],
    });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.id === "source_line_count")).toBe(true);
  });

  it("fails on priced similar match", () => {
    const r = assertExportGuards({
      quoteLines: [
        {
          matchType: "similar",
          unitPriceNet: 10,
          productId: "1",
          article: "A",
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(
      r.violations.some((v) => v.id === "price_without_eligible_match")
    ).toBe(true);
  });

  it("stripIllegalPrices zeroes non-eligible prices", () => {
    const out = stripIllegalPrices([
      { matchType: "exact", unitPriceNet: 5, lineTotal: 5, allowPrice: true },
      { matchType: "similar", unitPriceNet: 9, lineTotal: 9, allowPrice: false },
    ]);
    expect(out[0].unitPriceNet).toBe(5);
    expect(out[1].unitPriceNet).toBe(0);
  });

  it("passes clean exact draft", () => {
    const r = assertExportGuards({
      sourceLines: [{}],
      quoteLines: [
        {
          matchType: "exact",
          unitPriceNet: 10,
          productId: "42",
          article: "SKU",
          allowPrice: true,
        },
      ],
    });
    expect(r.ok).toBe(true);
  });
});

describe("requestTrace", () => {
  it("records stages and summary", () => {
    const trace = createRequestTrace({ channel: "workspace" });
    setTraceIntent(trace, { primaryIntent: "create_quote", confidence: 0.9 });
    markStage(trace, "PARSE", "ok", { ms: 12 });
    appendMatchEvidence(trace, [
      buildLineEvidence({
        requestedName: "bolt",
        matchType: "exact",
        productId: "1",
        unitPriceNet: 1,
        allowPrice: true,
      }),
    ]);
    finalizeTrace(trace, { status: "ok" });
    const summary = summarizeTrace(trace);
    expect(summary.requestId).toBeTruthy();
    expect(summary.intent).toBe("create_quote");
    expect(summary.matchCount).toBe(1);
    expect(summary.stages).toContain("PARSE:ok");
  });
});

describe("quoteTools", () => {
  it("classifyMatch allows price only for exact/analog", () => {
    expect(classifyMatch("exact").allowPrice).toBe(true);
    expect(classifyMatch("analog").allowPrice).toBe(true);
    expect(classifyMatch("similar").allowPrice).toBe(false);
  });

  it("extractInquiryLines parses fastener lines", () => {
    const lines = extractInquiryLines("Болт DIN 933 M10x80 — 100 шт");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it("verifyQuote combines price + export gates", () => {
    const draft = {
      lines: [
        {
          matchType: "exact",
          unitPriceNet: 10,
          productId: "1",
          article: "A",
          allowPrice: true,
        },
      ],
    };
    const r = verifyQuote("| Цена |\n| --- |\n| 10 |", {
      draft,
      sourceLines: [{}],
    });
    expect(r.exportGate.ok).toBe(true);
  });
});

describe("pipelineEval", () => {
  it("compares business fingerprints ignoring cosmetic fields", () => {
    const a = draftBusinessFingerprint({
      lines: [
        {
          requestedName: "Болт",
          productId: "1",
          article: "S",
          matchType: "exact",
          unitPriceNet: 10,
          quantity: 2,
          allowPrice: true,
          comment: "hello",
        },
      ],
      subtotal: 20,
    });
    const b = draftBusinessFingerprint({
      lines: [
        {
          requestedName: "Болт",
          productId: "1",
          article: "S",
          matchType: "exact",
          unitPriceNet: 10,
          quantity: 2,
          allowPrice: true,
          comment: "different comment",
        },
      ],
      subtotal: 20,
    });
    expect(compareDraftFingerprints(a, b).same).toBe(true);
  });

  it("detects forbidden / illegal priced SKUs", () => {
    const hits = findForbiddenSkuHits(
      {
        lines: [
          { article: "BAD", matchType: "exact", unitPriceNet: 1 },
          { matchType: "similar", unitPriceNet: 5, article: "X" },
        ],
      },
      ["BAD"]
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("evaluatePipelineStability reports 100% replay on stable fn", async () => {
    const draft = {
      lines: [
        {
          requestedName: "a",
          productId: "1",
          article: "S",
          matchType: "exact",
          unitPriceNet: 3,
          quantity: 1,
          allowPrice: true,
        },
      ],
      subtotal: 3,
    };
    const report = await evaluatePipelineStability(async () => draft, {
      repeats: 4,
    });
    expect(report.deterministicReplayRate).toBe(1);
    expect(report.ok).toBe(true);
  });
});

describe("quotePipeline stages", () => {
  it("exposes full stage list", () => {
    expect(QUOTE_PIPELINE_STAGES).toContain("PARSE");
    expect(QUOTE_PIPELINE_STAGES).toContain("VERIFY_PRICES");
    expect(QUOTE_PIPELINE_STAGES).toContain("EXPORT");
  });

  it("returns empty_input without ShopDB when text blank", async () => {
    const result = await runQuotePipeline({
      inquiryText: "   ",
      skipExport: true,
    });
    expect(result.ok).toBe(false);
    expect(result.summary.result).toBe("empty_input");
  });
});
