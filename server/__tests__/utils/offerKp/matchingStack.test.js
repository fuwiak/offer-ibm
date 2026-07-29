"use strict";

/* eslint-env jest, node */

const {
  validateCandidate,
  applyConstraintsToAlternative,
} = require("../../../utils/offerKp/matching/constraintValidator");
const {
  buildBlockKeys,
  applyBlocking,
} = require("../../../utils/offerKp/matching/entityBlocking");
const {
  alignTechnicalNames,
} = require("../../../utils/offerKp/matching/tokenAlignment");
const {
  getAllowedAnalogs,
  areStandardsCompatible,
  findStandardPath,
} = require("../../../utils/offerKp/matching/standardGraph");
const {
  rankWithLtr,
  scoreFeatures,
  DEFAULT_WEIGHTS,
} = require("../../../utils/offerKp/matching/learningToRank");
const {
  extractMatchFeatures,
} = require("../../../utils/offerKp/matching/matchFeatures");
const {
  logEvidenceScore,
} = require("../../../utils/offerKp/matching/bayesianScore");
const {
  costSensitiveDecision,
  MATCH_COSTS,
} = require("../../../utils/offerKp/matching/costSensitive");
const {
  selectivePredict,
} = require("../../../utils/offerKp/matching/selectivePrediction");
const {
  conformalCandidateSet,
} = require("../../../utils/offerKp/matching/conformalPrediction");
const {
  detectAnomaly,
} = require("../../../utils/offerKp/matching/anomalyDetection");
const {
  activeLearningScore,
} = require("../../../utils/offerKp/matching/activeLearning");
const {
  resolveExpert,
} = require("../../../utils/offerKp/matching/productTypeExperts");
const {
  aggregateWeakLabels,
} = require("../../../utils/offerKp/matching/weakSupervision");
const {
  enrichMatchDecision,
} = require("../../../utils/offerKp/matching");

describe("constraintValidator", () => {
  it("flags diameter/length mismatches as hard violations", () => {
    const result = validateCandidate("Болт DIN 933 M10x80", {
      name: "Болт DIN 933 M12x80",
    });
    expect(result.ok).toBe(false);
    expect(result.hard).toContain("diameter_mismatch");
  });

  it("accepts exact size match", () => {
    const result = validateCandidate("Болт DIN 933 M10x80", {
      name: "Болт DIN 933 M10x80 оцинк 8.8",
    });
    expect(result.ok).toBe(true);
    expect(result.hard).toEqual([]);
  });

  it("demotes exact alternative with hard size mismatch", () => {
    const alt = applyConstraintsToAlternative("гайка DIN 934 M10", {
      name: "Гайка DIN 934 M12",
      matchType: "exact",
      price: 5,
    });
    expect(alt.matchType).toBe("size_mismatch");
    expect(alt.constraintViolations.length).toBeGreaterThan(0);
  });
});

describe("entityBlocking", () => {
  it("builds type+diameter block keys", () => {
    const block = buildBlockKeys("Болт DIN 933 M10x80");
    expect(block.diameter).toBe("10");
    expect(block.keys.some((k) => k.includes("M10"))).toBe(true);
  });

  it("filters candidates outside the block but never empties the pool", () => {
    const { candidates, filtered } = applyBlocking("Болт M10x80", [
      { id: 1, name: "Болт DIN 933 M10x80" },
      { id: 2, name: "Болт DIN 933 M6x20" },
      { id: 3, name: "Гайка DIN 934 M10" },
    ]);
    expect(candidates.length).toBeGreaterThan(0);
    if (filtered) {
      expect(candidates.every((c) => /M10|m10/i.test(c.name))).toBe(true);
    }
  });
});

describe("tokenAlignment", () => {
  it("scores coating synonym cheaply vs diameter swap", () => {
    const soft = alignTechnicalNames(
      "болт din 933 m10x80 цинк",
      "болт din 933 m10x80 оцинк"
    );
    const hard = alignTechnicalNames(
      "болт din 933 m10x80",
      "болт din 933 m12x80"
    );
    expect(soft.similarity).toBeGreaterThan(hard.similarity);
  });
});

describe("standardGraph", () => {
  it("links DIN 933 to ГОСТ/ISO analogs", () => {
    const allowed = getAllowedAnalogs("933");
    expect(allowed).toEqual(expect.arrayContaining(["933", "7805", "4017"]));
    expect(areStandardsCompatible("933", "7805")).toBe(true);
    expect(findStandardPath("933", "7805")).toEqual(["933", "7805"]);
  });
});

describe("learningToRank + features", () => {
  it("extracts a fixed-length feature vector", () => {
    const { vector, featureNames } = extractMatchFeatures(
      "Болт DIN 933 M10x80",
      { name: "Болт DIN 933 M10x80", price: 10, stockCount: 5, matchType: "exact" }
    );
    expect(vector).toHaveLength(featureNames.length);
    expect(scoreFeatures(
      extractMatchFeatures("Болт DIN 933 M10x80", {
        name: "Болт DIN 933 M10x80",
        matchType: "exact",
      }).features,
      DEFAULT_WEIGHTS
    )).toBeGreaterThan(0);
  });

  it("ranks exact size above wrong size", () => {
    const ranked = rankWithLtr("Болт DIN 933 M10x80", [
      {
        productId: "1",
        name: "Болт DIN 933 M6x20",
        matchType: "similar",
        price: 1,
      },
      {
        productId: "2",
        name: "Болт DIN 933 M10x80",
        matchType: "exact",
        price: 10,
      },
    ]);
    expect(ranked[0].productId).toBe("2");
    expect(ranked[0]._ltrScore).toBeGreaterThan(ranked[1]._ltrScore);
  });
});

describe("bayesianScore", () => {
  it("gives higher evidence to matching thread+standard", () => {
    const good = logEvidenceScore("Болт DIN 933 M10x80", {
      name: "Болт DIN 933 M10x80 оцинк",
    });
    const bad = logEvidenceScore("Болт DIN 933 M10x80", {
      name: "Болт DIN 933 M12x40",
    });
    expect(good).toBeGreaterThan(bad);
  });
});

describe("costSensitive + selective", () => {
  it("blocks exact when hard constraints present", () => {
    const decision = costSensitiveDecision({
      matchType: "exact",
      price: 10,
      constraintViolations: ["diameter_mismatch"],
      _ltrScore: 5,
    });
    expect(decision.allowExact).toBe(false);
    expect(decision.reason).toBe("hard_constraint");
    expect(MATCH_COSTS.wrong_exact_with_price).toBe(100);
  });

  it("rejects automation on OOD", () => {
    const sel = selectivePredict({
      best: { matchType: "exact", _ltrScore: 10 },
      outOfDistribution: true,
    });
    expect(sel.automate).toBe(false);
    expect(sel.reason).toBe("out_of_distribution");
  });
});

describe("conformalPrediction", () => {
  it("returns singleton for high-confidence exact", () => {
    const set = conformalCandidateSet([
      {
        productId: "1",
        sku: "A",
        name: "Болт M10x80",
        matchType: "exact",
        price: 10,
        _ltrScore: 8,
        softConstraintViolations: [],
        constraintViolations: [],
      },
      {
        productId: "2",
        sku: "B",
        name: "Болт M10x70",
        matchType: "similar",
        price: 9,
        _ltrScore: 2,
        constraintViolations: [],
      },
    ]);
    expect(set.singleton).toBe(true);
    expect(set.skus).toEqual(["A"]);
  });
});

describe("anomalyDetection", () => {
  it("flags repeated-char spam", () => {
    const a = detectAnomaly("аааааааааааааааа");
    expect(a.outOfDistribution).toBe(true);
    expect(a.reasons).toContain("repeated_char_spam");
  });

  it("allows normal fastener line", () => {
    const a = detectAnomaly("Болт DIN 933 M10x80 оцинк 8.8");
    expect(a.allowAutomaticMatch).toBe(true);
  });

  it("does not treat missing embedding scores as far-from-catalog", () => {
    const a = detectAnomaly("Шайба DIN 433 M 6 оцинк", {
      candidates: [{ id: 1, name: "Шайба DIN 433 M 6" }, { id: 2 }],
      embeddingTop: 0,
    });
    expect(a.reasons).not.toContain("embedding_far_from_catalog");
    expect(a.outOfDistribution).toBe(false);
  });
});

describe("activeLearning + experts + weak supervision", () => {
  it("prioritizes retriever disagreement", () => {
    const al = activeLearningScore({
      retrieverDisagreement: true,
      matchType: "exact",
    });
    expect(al.shouldLabel).toBe(true);
    expect(al.reasons).toContain("retriever_disagreement");
  });

  it("routes bolt queries to bolt expert", () => {
    const { expertId } = resolveExpert("Болт DIN 933 M10x80");
    expect(expertId).toBe("болт");
  });

  it("aggregates weak labels from features", () => {
    const weak = aggregateWeakLabels({
      features: {
        standardMatch: 1,
        diameterMatch: 1,
        lengthMatch: 1,
        isAnalogCandidate: 0,
      },
    });
    expect(weak.label).toBe("exact");
    expect(weak.confidence).toBeGreaterThan(0);
  });
});

describe("enrichMatchDecision orchestration", () => {
  it("demotes wrong-size exact and attaches conformal/AL metadata", () => {
    const result = enrichMatchDecision({
      queryText: "Болт DIN 933 M10x80",
      alternatives: [
        {
          productId: "1",
          name: "Болт DIN 933 M12x80",
          matchType: "exact",
          price: 12,
          sku: "X",
          stockCount: 3,
        },
        {
          productId: "2",
          name: "Болт DIN 933 M10x80",
          matchType: "exact",
          price: 15,
          sku: "Y",
          stockCount: 5,
        },
      ],
      products: [
        { id: "1", name: "Болт DIN 933 M12x80" },
        { id: "2", name: "Болт DIN 933 M10x80" },
      ],
    });
    const wrong = result.alternatives.find((a) => a.productId === "1");
    // Blocking may drop M12 entirely; if kept, constraints demote exact.
    if (wrong) {
      expect(wrong.matchType).not.toBe("exact");
    } else {
      expect(result.blocking.filtered).toBe(true);
    }
    const good = result.alternatives.find((a) => a.productId === "2");
    expect(good).toBeTruthy();
    expect(good.matchType).toBe("exact");
    expect(result.conformal).toBeTruthy();
    expect(result.activeLearning).toBeTruthy();
    expect(result.expert.id).toBe("болт");
  });
});
