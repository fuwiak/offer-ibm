# Golden RAG self-match — isolated graphify

Oracle: 100 catalog self-match rows from ShopDB RAG
(`canonical-products.json`, seed `offerkp-rag-2026`).

| File | Role |
|------|------|
| `Rag_catalog_selfmatch_100.expected.csv` | Ground-truth CSV |
| `goldenSnapshot.cjs` | Same rows + helpers for graphify AST |
| `compare-vs-golden.cjs` | Live matcher vs **this** pack |
| `graphify-out/` | Separate graph — query with `--graph` |

## Compare

```bash
# from repo root
node graphify-audits/golden-rag-selfmatch-100/compare-vs-golden.cjs
node graphify-audits/golden-rag-selfmatch-100/compare-vs-golden.cjs --limit 20
```

Report → `last-compare.json` + `last-compare.meta.json` in this folder.

## Graphify

```bash
cd graphify-audits/golden-rag-selfmatch-100
graphify . --no-viz --code-only
graphify cluster-only . --no-viz --no-label
graphify query "golden self-match SKU oracle" --graph graphify-out/graph.json
graphify explain "GOLDEN_META" --graph graphify-out/graph.json
```

## Renew

```bash
node scripts/renew-golden-from-rag.cjs
# also syncs CSV + goldenSnapshot into this pack
```
