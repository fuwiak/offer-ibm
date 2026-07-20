# offerkp-ops — Selectel Lainey live dashboard

Analog of `bober-ai/cli`: Bubble Tea TUI that watches container / health / docker logs / deploy log in real time.

## Install

```bash
yarn ops:install
# or: bash cli/install.sh
```

Puts `offerkp` on `~/bin` and enables `.githooks/post-commit`.

## Usage

```bash
offerkp              # TUI Status (auto-refresh)
offerkp build        # live deploy log tab
offerkp logs         # docker logs
offerkp status --plain   # used by post-commit
```

Keys: `Tab` switch · `f` follow · `r` refresh · `q` quit

## Commit trigger

Every `git commit` runs `offerkp status --plain` (non-blocking). Skip with:

```bash
OFFERKP_OPS_SKIP=1 git commit ...
```

## Deploy (writes READY + deploy log for Build tab)

```bash
bash scripts/deploy-lainey-app.sh
```

## Env

| Variable | Default |
|---|---|
| `LAINEY_HOST` / `OFFERKP_HOST` | `87.228.90.43` |
| `OFFERKP_CONTAINER` | `offer-kp` |
| `OFFERKP_PUBLIC_URL` | `http://offer-ibm.ru` |
| `OFFERKP_DEPLOY_LOG` | `/opt/offer-kp/build.log` |
| `OFFERKP_READY_FILE` | `/opt/offer-kp/READY` |

Detects **systemd** (`offer-kp.service`) first, then Docker. Logs come from `journalctl`.
