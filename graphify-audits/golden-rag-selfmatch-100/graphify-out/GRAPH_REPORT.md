# Graph Report - .  (2026-07-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 24 nodes · 23 edges · 3 communities
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dd0a5eed`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2

## God Nodes (most connected - your core abstractions)
1. `option()` - 2 edges
2. `main()` - 2 edges
3. `parseCsvLine()` - 2 edges
4. `main()` - 2 edges
5. `fs` - 1 edges
6. `path` - 1 edges
7. `{ spawnSync }` - 1 edges
8. `REPO_ROOT` - 1 edges
9. `DEFAULT_CSV` - 1 edges
10. `DEFAULT_JSON` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (3 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.25
Nodes (8): DEFAULT_CSV, DEFAULT_JSON, fs, main(), option(), path, REPO_ROOT, { spawnSync }

### Community 1 - "Community 1"
Cohesion: 0.25
Nodes (3): GOLDEN_META, GOLDEN_ROWS, path

### Community 2 - "Community 2"
Cohesion: 0.33
Nodes (6): CSV, fs, main(), OUT, parseCsvLine(), path

## Knowledge Gaps
- **13 isolated node(s):** `fs`, `path`, `{ spawnSync }`, `REPO_ROOT`, `DEFAULT_CSV` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `fs`, `path`, `{ spawnSync }` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._