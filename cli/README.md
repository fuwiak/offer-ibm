# offerkp-ops — Selectel Lainey live dashboard

Analog of `bober-ai/cli`: Bubble Tea TUI that watches container / health / docker logs / deploy log / GitHub Actions CI/CD in real time.

## Install

```bash
yarn ops:install
# or: bash cli/install.sh
```

Puts `offerkp` on `~/bin` and enables `.githooks/post-commit`.

Requires [GitHub CLI](https://cli.github.com/) (`gh auth login`) for the **CI/CD** tab.

## Usage

```bash
offerkp              # TUI Status (auto-refresh)
offerkp build        # live deploy log tab
offerkp logs         # docker / journalctl logs
offerkp cicd         # GitHub Actions → Selectel deploy
offerkp metrics      # ShopDB retrieval quality (continuous, matchInquiryLine)
offerkp status --plain   # used by post-commit
offerkp cicd --plain
offerkp metrics --plain [--hours N]
```

Keys: `Tab` switch · `1-6` jump · `f` follow · `r` refresh · `q` quit

### Metrics tab

Reads the aggregated report from `scripts/report-shopdb-metrics.cjs`, run remotely over SSH
against `OFFERKP_REMOTE_APP` (default `/opt/offer-kp/app`). That script aggregates
`storage/metrics/shopdb-search.jsonl` — a continuous, fire-and-forget log written by
`server/utils/offerKp/searchMetrics.js` on every `matchInquiryLine` call in production
(match type, search strategy used, candidate count — no PII, no prices). See `AUDYT.md` §9.

## Commit trigger

Every `git commit` runs `offerkp status --plain` (non-blocking). Skip with:

```bash
OFFERKP_OPS_SKIP=1 git commit ...
```

## Deploy (writes READY + deploy log for Build tab)

```bash
bash scripts/deploy-lainey-sync.sh
# or: push to main → GitHub Actions "Deploy Selectel Lainey"
```

## Env

| Variable | Default |
|---|---|
| `LAINEY_HOST` / `OFFERKP_HOST` | `87.228.90.43` |
| `OFFERKP_CONTAINER` | `offer-kp` |
| `OFFERKP_PUBLIC_URL` | `http://offer-ibm.ru` |
| `OFFERKP_DEPLOY_LOG` | `/opt/offer-kp/build.log` |
| `OFFERKP_READY_FILE` | `/opt/offer-kp/READY` |
| `OFFERKP_GITHUB_REPO` | `fuwiak/offer-ibm` |
| `OFFERKP_GITHUB_WORKFLOW` | `deploy-selectel.yml` |
| `OFFERKP_REMOTE_APP` | `/opt/offer-kp/app` (cwd for the metrics script) |

Detects **systemd** (`offer-kp.service`) first, then Docker. Logs come from `journalctl`.
CI/CD reads GitHub Actions via `gh` (not Railway).
