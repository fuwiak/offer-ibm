"use strict";

/**
 * Mixture-of-Experts without multiple LLMs: per product-type matcher config.
 */

const { parseHardwareQuery } = require("../hardwareQuery");

/** @type {Record<string, {
 *   criticalFields: string[],
 *   exactMarginMin: number,
 *   allowAnalog: boolean,
 *   softFields: string[],
 * }>} */
const EXPERTS = {
  болт: {
    criticalFields: ["diameter", "length", "standard"],
    exactMarginMin: 0.12,
    allowAnalog: true,
    softFields: ["coating", "strength"],
  },
  винт: {
    criticalFields: ["diameter", "length", "standard"],
    exactMarginMin: 0.12,
    allowAnalog: true,
    softFields: ["coating", "strength"],
  },
  гайка: {
    criticalFields: ["diameter", "standard"],
    exactMarginMin: 0.1,
    allowAnalog: true,
    softFields: ["coating", "strength"],
  },
  шайба: {
    criticalFields: ["diameter", "standard"],
    exactMarginMin: 0.08,
    allowAnalog: true,
    softFields: ["coating"],
  },
  штифт: {
    criticalFields: ["diameter", "length", "standard"],
    exactMarginMin: 0.15,
    allowAnalog: true,
    softFields: [],
  },
  анкер: {
    criticalFields: ["diameter", "length"],
    exactMarginMin: 0.14,
    allowAnalog: false,
    softFields: ["coating"],
  },
  unknown: {
    criticalFields: ["diameter", "length"],
    exactMarginMin: 0.18,
    allowAnalog: false,
    softFields: [],
  },
};

function resolveExpert(queryText) {
  const parsed = parseHardwareQuery(queryText);
  const types = parsed.productTypes || [];
  for (const t of types) {
    if (EXPERTS[t]) {
      return { expertId: t, config: EXPERTS[t], parsed };
    }
  }
  return { expertId: "unknown", config: EXPERTS.unknown, parsed };
}

module.exports = {
  EXPERTS,
  resolveExpert,
};
