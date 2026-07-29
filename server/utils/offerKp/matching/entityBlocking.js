"use strict";

/**
 * Entity-resolution blocking: shrink candidate pool before ranking.
 * Block keys = productType + diameter (+ optional standard family).
 */

const { parseHardwareQuery, PRODUCT_TYPE_ROOTS, normalizeForMatch } = require("../hardwareQuery");
const { extractThread, extractStandardNumbers, getEquivalentStandards } = require("../analogRules");
const { getAllowedAnalogs } = require("./standardGraph");

/**
 * @param {string} queryText
 * @returns {{
 *   productTypes: string[],
 *   diameter: string|null,
 *   length: string|null,
 *   standards: string[],
 *   keys: string[],
 * }}
 */
function buildBlockKeys(queryText) {
  const parsed = parseHardwareQuery(queryText);
  const thread = parsed.thread;
  const standards = [
    ...new Set(
      (extractStandardNumbers(queryText) || []).flatMap((s) => getAllowedAnalogs(s))
    ),
  ];
  const productTypes = parsed.productTypes || [];
  const diameter = thread?.size || parsed.diameter || null;
  const length = thread?.length || null;

  const keys = [];
  if (productTypes.length && diameter) {
    for (const t of productTypes) {
      keys.push(`${t}|M${diameter}`);
      if (length) keys.push(`${t}|M${diameter}x${length}`);
    }
  } else if (diameter) {
    keys.push(`*|M${diameter}`);
    if (length) keys.push(`*|M${diameter}x${length}`);
  } else if (productTypes.length) {
    for (const t of productTypes) keys.push(`${t}|*`);
  }
  for (const s of standards.slice(0, 8)) {
    keys.push(`std:${s}`);
  }

  return { productTypes, diameter, length, standards, keys };
}

function candidateBlockKeys(product = {}) {
  const name = product.name || "";
  const nameNorm = normalizeForMatch(name);
  const parsed = parseHardwareQuery(name);
  const thread = extractThread(name) || parsed.thread;
  const standards = extractStandardNumbers(name);
  const types = [];
  for (const [type, roots] of Object.entries(PRODUCT_TYPE_ROOTS)) {
    if (roots.some((r) => nameNorm.includes(normalizeForMatch(r)))) {
      types.push(type);
    }
  }
  const keys = [];
  const diameter = thread?.size || parsed.diameter || null;
  const length = thread?.length || null;
  const typeList = types.length ? types : ["*"];
  for (const t of typeList) {
    if (diameter) {
      keys.push(`${t}|M${diameter}`);
      if (length) keys.push(`${t}|M${diameter}x${length}`);
    } else {
      keys.push(`${t}|*`);
    }
  }
  if (diameter) {
    keys.push(`*|M${diameter}`);
    if (length) keys.push(`*|M${diameter}x${length}`);
  }
  for (const s of standards) {
    for (const eq of getEquivalentStandards(s)) keys.push(`std:${eq}`);
  }
  return [...new Set(keys)];
}

/**
 * Keep candidates that share at least one block key with the query.
 * If query has no useful keys, return all candidates unchanged.
 */
function applyBlocking(queryText, candidates = []) {
  const block = buildBlockKeys(queryText);
  if (!block.keys.length || !candidates.length) {
    return { candidates, block, filtered: false, kept: candidates.length };
  }

  // Prefer structural blocks (type+size). Standard-only keys are weak alone.
  const structural = block.keys.filter((k) => !k.startsWith("std:"));
  const useKeys = structural.length ? structural : block.keys;

  const kept = candidates.filter((c) => {
    const cKeys = candidateBlockKeys(c);
    return useKeys.some((k) => cKeys.includes(k));
  });

  // Safety: never empty the pool if we had candidates — blocking is recall-first.
  if (!kept.length) {
    return { candidates, block, filtered: false, kept: candidates.length };
  }

  return {
    candidates: kept,
    block,
    filtered: kept.length < candidates.length,
    kept: kept.length,
  };
}

module.exports = {
  buildBlockKeys,
  candidateBlockKeys,
  applyBlocking,
};
