"use strict";

/**
 * Small knowledge graph over DIN↔ГОСТ/ISO analog rules.
 * Not GraphRAG — adjacency list for blocking, analog lookup, contradiction checks.
 */

const { ANALOG_RULES } = require("../analogRules");

/** @type {Map<string, Set<string>>} */
let adjacencyCache = null;
/** @type {Map<string, {productType: string, matchRule: string, label: string}>} */
let nodeMetaCache = null;

function ensureGraph() {
  if (adjacencyCache) return;
  adjacencyCache = new Map();
  nodeMetaCache = new Map();

  const addEdge = (a, b) => {
    const ka = String(a);
    const kb = String(b);
    if (!adjacencyCache.has(ka)) adjacencyCache.set(ka, new Set());
    if (!adjacencyCache.has(kb)) adjacencyCache.set(kb, new Set());
    adjacencyCache.get(ka).add(kb);
    adjacencyCache.get(kb).add(ka);
  };

  for (const rule of ANALOG_RULES) {
    const din = String(rule.din);
    nodeMetaCache.set(din, {
      productType: rule.productType,
      matchRule: rule.matchRule,
      label: rule.label,
    });
    for (const alt of rule.analogs) {
      const a = String(alt);
      addEdge(din, a);
      nodeMetaCache.set(a, {
        productType: rule.productType,
        matchRule: rule.matchRule,
        label: rule.label,
      });
    }
  }
}

function resetStandardGraphCache() {
  adjacencyCache = null;
  nodeMetaCache = null;
}

/** All standards connected (directly) to stdNum, including itself. */
function getAllowedAnalogs(stdNum) {
  ensureGraph();
  const n = String(stdNum);
  const neighbors = adjacencyCache.get(n);
  if (!neighbors) return [n];
  return [n, ...neighbors];
}

function areStandardsCompatible(a, b) {
  if (!a || !b) return true;
  const sa = String(a);
  const sb = String(b);
  if (sa === sb) return true;
  ensureGraph();
  const neighbors = adjacencyCache.get(sa);
  return neighbors ? neighbors.has(sb) : false;
}

/**
 * BFS path between two standard numbers (max depth 3).
 * @returns {string[]|null}
 */
function findStandardPath(from, to) {
  ensureGraph();
  const start = String(from);
  const goal = String(to);
  if (start === goal) return [start];
  if (!adjacencyCache.has(start) || !adjacencyCache.has(goal)) return null;

  const queue = [[start]];
  const seen = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    if (path.length > 4) continue;
    const last = path[path.length - 1];
    for (const next of adjacencyCache.get(last) || []) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      if (next === goal) return nextPath;
      seen.add(next);
      queue.push(nextPath);
    }
  }
  return null;
}

function getStandardMeta(stdNum) {
  ensureGraph();
  return nodeMetaCache.get(String(stdNum)) || null;
}

function listGraphNodes() {
  ensureGraph();
  return [...nodeMetaCache.keys()];
}

module.exports = {
  getAllowedAnalogs,
  areStandardsCompatible,
  findStandardPath,
  getStandardMeta,
  listGraphNodes,
  resetStandardGraphCache,
};
