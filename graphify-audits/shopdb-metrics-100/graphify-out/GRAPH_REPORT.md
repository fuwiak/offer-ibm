# Graph Report - graphify-audits/shopdb-metrics-100  (2026-07-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 80 nodes · 116 edges · 8 communities
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `890afcac`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.js
- learningToRank.js
- shopDbBm25Index.js
- audit-shopdb-random-sample.cjs
- top50Rerank.js
- report-shopdb-metrics.cjs
- costSensitive.js

## God Nodes (most connected - your core abstractions)
1. `rerankTop50()` - 9 edges
2. `rankWithLtr()` - 6 edges
3. `minAcceptMargin()` - 5 edges
4. `main()` - 4 edges
5. `enrichAlternatives()` - 4 edges
6. `decideMatchGates()` - 4 edges
7. `extractMatchFeatures()` - 4 edges
8. `main()` - 4 edges
9. `cleanText()` - 4 edges
10. `searchableField()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `enrichAlternatives()` --calls--> `rankWithLtr()`  [EXTRACTED]
  index.js → learningToRank.js
- `enrichAlternatives()` --calls--> `rerankTop50()`  [EXTRACTED]
  index.js → top50Rerank.js
- `decideMatchGates()` --calls--> `isIdentityRival()`  [EXTRACTED]
  index.js → top50Rerank.js
- `decideMatchGates()` --calls--> `minAcceptMargin()`  [EXTRACTED]
  index.js → top50Rerank.js
- `rankWithLtr()` --calls--> `extractMatchFeatures()`  [EXTRACTED]
  learningToRank.js → matchFeatures.js

## Import Cycles
- None detected.

## Communities (8 total, 0 thin omitted)

### Community 0 - "index.js"
Cohesion: 0.15
Nodes (13): { activeLearningScore }, { aggregateWeakLabels }, { applyBlocking }, { applyConstraintsToAlternative }, { conformalCandidateSet }, { detectAnomaly }, enrichAlternatives(), enrichMatchDecision() (+5 more)

### Community 1 - "learningToRank.js"
Cohesion: 0.21
Nodes (12): DEFAULT_WEIGHTS, { FEATURE_NAMES, extractMatchFeatures }, ltrEnabled(), rankWithLtr(), scoreFeatures(), { alignTechnicalNames }, bool01(), extractMatchFeatures() (+4 more)

### Community 2 - "shopDbBm25Index.js"
Cohesion: 0.24
Nodes (11): cleanText(), { create, insertMultiple, search }, createBm25Index(), documentFields(), enabled(), FIELD_BOOSTS, { foldHomoglyphs, normalizeSearchText }, getShopDbBm25Index() (+3 more)

### Community 3 - "audit-shopdb-random-sample.cjs"
Cohesion: 0.21
Nodes (11): {
  configuredOptPriceCategoryId,
}, {
  getShopDbReadiness,
}, { loadEnv }, main(), {
  matchInquiryLine,
}, option(), path, pct() (+3 more)

### Community 4 - "top50Rerank.js"
Cohesion: 0.36
Nodes (10): decideMatchGates(), envFloat(), envInt(), hardConflictCount(), identityRerankScore(), isIdentityRival(), minAcceptMargin(), rerankTop50() (+2 more)

### Community 5 - "report-shopdb-metrics.cjs"
Cohesion: 0.31
Nodes (8): fs, { loadEnv }, main(), { METRICS_FILE, isMetricsEnabled }, parseArgs(), path, pct(), readAllLines()

### Community 6 - "costSensitive.js"
Cohesion: 0.60
Nodes (4): costSensitiveDecision(), estimateAcceptCost(), exactAcceptThresholds(), MATCH_COSTS

## Knowledge Gaps
- **32 isolated node(s):** `path`, `{ loadEnv }`, `{ query, resetPool }`, `{
  getShopDbReadiness,
}`, `{
  runProductSearchAgent,
}` (+27 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `rerankTop50()` connect `top50Rerank.js` to `index.js`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `rankWithLtr()` connect `learningToRank.js` to `index.js`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `path`, `{ loadEnv }`, `{ query, resetPool }` to the rest of the system?**
  _32 weakly-connected nodes found - possible documentation gaps or missing edges._