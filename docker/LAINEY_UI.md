# OfferKP UI на Lainey (Selectel only)

**URL:** http://offer-ibm.ru/ (и http://87.228.90.43/)

Стек на сервере Lainey (`87.228.90.43`), **без Railway**:

- nginx `:80` → Node app `:3001`
- systemd: `offer-kp.service`, `offer-kp-collector.service`
- код: `/opt/offer-kp/app`
- данные: `/opt/offer-kp/data`
- collector hotdir: `/opt/offer-kp/app/collector/hotdir`
- LLM: dual-model LM Studio на T4 16GB (см. ниже) / OpenRouter teacher через egress

## Dual-model LLM (oczy / mózg / prawda)

На Tesla T4 **16 ГБ** обе модели **не** держатся в VRAM сразу — только sequential `unload → load`.

| Rola | Model | Zadanie |
|------|-------|---------|
| **Oczy** | `qwen/qwen3-vl-8b-thinking` | PDF/zdjęcia → JSON (nazwa, qty, unit). Bez cen/SKU. |
| **Mózg** | `openai/gpt-oss-20b` (ctx **32768**) | Agent tools, retry, niejednoznaczności. |
| **Prawda** | ShopDB + `matchInquiry` / `analogRules` / quote PDF | Exact / najtańszy analog, ceny, sumy, КП. |

Start / enable LM Studio:

```bash
export PATH="/root/.lmstudio/bin:$PATH"
lms server start --port 1234
# Boot brain (idle). Eyes load only during OCR via app.
lms load openai/gpt-oss-20b --context-length 32768 --gpu max -y
# systemd: docker/lmstudio-server.service → /etc/systemd/system/
```

Fallback brain if gpt-oss missing/OOM: `qwen/qwen3-vl-8b`.

### Szybki switch VRAM (jeden model naraz)

Na serwerze:

```bash
bash /opt/offer-kp/app/docker/lmstudio-switch.sh status   # co w VRAM
bash /opt/offer-kp/app/docker/lmstudio-switch.sh eyes     # OCR / Thinking
bash /opt/offer-kp/app/docker/lmstudio-switch.sh brain    # agent (idle)
bash /opt/offer-kp/app/docker/lmstudio-switch.sh unload   # wolne GPU
```

Z laptopa: `yarn lms:brain` / `yarn lms:eyes` (skrypt lokalny; na Lainey przez SSH).

API (auth): `GET /api/offerKp/pipeline/status`, `POST /api/offerKp/pipeline/switch` body `{"stage":"brain"}`.
App sama robi sequential swap (mutex) — OCR → eyes, potem z powrotem brain.

In `server/.env`:

```
OFFER_KP_TEACHER_LLM=0
LLM_PROVIDER=lmstudio
LMSTUDIO_BASE_PATH=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL_PREF=openai/gpt-oss-20b
OFFER_KP_PIPELINE_VISION_MODEL=qwen/qwen3-vl-8b-thinking
OFFER_KP_PIPELINE_AGENT_MODEL=openai/gpt-oss-20b
OFFER_KP_PIPELINE_AGENT_FALLBACK=qwen/qwen3-vl-8b
OFFER_KP_PIPELINE_AGENT_CONTEXT=32768
LMSTUDIO_ASK_MODEL_PREF=qwen/qwen3-vl-8b
LMSTUDIO_MODEL_TOKEN_LIMIT=32768
```

Прямой доступ к `openrouter.ai` с IP Lainey даёт `403 Access denied by security policy`.
Нужен egress-proxy на машине вне блокировки + reverse SSH:

```bash
# на ноутбуке (EU):
node scripts/openrouter-egress-proxy.cjs
ssh -N -R 127.0.0.1:8787:127.0.0.1:8787 root@87.228.90.43
```

На сервере в `server/.env`:

```
OPENROUTER_BASE_URL=http://127.0.0.1:8787/api/v1
COLLECTOR_HOTDIR=/opt/offer-kp/app/collector/hotdir
STORAGE_DIR=/opt/offer-kp/data
```

Collector systemd обязан иметь `Environment=STORAGE_DIR=...` (иначе crash loop).

## Обновление (CI/CD)

**Автоматически:** push в `main` → GitHub Actions `Deploy Selectel Lainey`
(`.github/workflows/deploy-selectel.yml`). Нужен secret `LAINEY_SSH_KEY`.

**Вручную с ноутбука:**

```bash
yarn deploy:lainey
# = bash scripts/deploy-lainey-sync.sh
```

Скрипт: frontend `VITE_API_BASE=/api` → rsync → `/opt/offer-kp/app` →
`server/public` → `systemctl restart offer-kp offer-kp-collector`.

Старый docker-путь: `yarn deploy:lainey:docker`.

Важно: production-сборка только с `VITE_API_BASE=/api`. Если оставить `localhost:3001`, в браузере будет Failed to fetch.
