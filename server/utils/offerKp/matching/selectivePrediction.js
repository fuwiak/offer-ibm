"use strict";

/**
 * Selective prediction / reject option.
 * Automate easy cases; abstain on hard ones under a risk budget.
 */

const { costSensitiveDecision } = require("./costSensitive");

/**
 * @param {{
 *   best: object|null,
 *   runnerUp?: object|null,
 *   expertConfig?: object|null,
 *   retrieverDisagreement?: boolean,
 *   underspecified?: boolean,
 *   outOfDistribution?: boolean,
 * }} input
 */
function selectivePredict(input = {}) {
  const {
    best,
    runnerUp = null,
    expertConfig = null,
    retrieverDisagreement = false,
    underspecified = false,
    outOfDistribution = false,
  } = input;

  if (underspecified) {
    return {
      automate: false,
      acceptExact: false,
      acceptAnalog: false,
      reason: "underspecified",
      coverageClass: "reject",
    };
  }
  if (outOfDistribution) {
    return {
      automate: false,
      acceptExact: false,
      acceptAnalog: false,
      reason: "out_of_distribution",
      coverageClass: "reject",
    };
  }
  if (retrieverDisagreement) {
    return {
      automate: false,
      acceptExact: false,
      acceptAnalog: false,
      reason: "retriever_disagreement",
      coverageClass: "reject",
    };
  }

  const cost = costSensitiveDecision(best, runnerUp, expertConfig);
  const acceptExact = cost.allowExact;
  const acceptAnalog = cost.allowAnalog && best?.matchType === "analog";
  const automate =
    (acceptExact && best?.matchType === "exact") ||
    (acceptAnalog && best?.matchType === "analog");

  return {
    automate,
    acceptExact,
    acceptAnalog,
    reason: cost.reason,
    expectedCost: cost.expectedCost,
    coverageClass: automate ? "auto" : "reject",
  };
}

module.exports = { selectivePredict };
