# OfferKP UI на Lainey (Selectel only)

**URL:** http://offer-ibm.ru/ (и http://87.228.90.43/)

Стек на сервере Lainey (`87.228.90.43`), **без Railway**:

- nginx `:80` → Node app `:3001`
- systemd: `offer-kp.service`, `offer-kp-collector.service`
- код: `/opt/offer-kp/app`
- данные: `/opt/offer-kp/data`
- collector hotdir: `/opt/offer-kp/app/collector/hotdir`
- LLM: **одна резидентная** модель LM Studio на T4 16GB + опц. OpenRouter teacher через egress

---

## LLM: single-resident model (актуально)

Раньше был sequential swap **eyes** (`qwen3-vl-*-thinking`) ↔ **brain** (`gpt-oss-20b`) — каждое переключение OCR↔agent стоило **90+ секунд** на T4. Сейчас:

| Роль | Модель | Задача |
|------|--------|--------|
| **Eyes + Brain** | `qwen/qwen3-vl-8b` (ctx 32768) | OCR/JSON позиций **и** chat/agent |
| **Правда** | ShopDB + `matchInquiry` / `analogRules` / quote gates | SKU, цены, статусы, КП |

`OFFER_KP_SINGLE_MODEL=true` в `server/config/offerKp.llm.defaults.js` и `.env` прода.

Старт LM Studio:

```bash
export PATH="/root/.lmstudio/bin:$PATH"
lms server start --port 1234
lms load qwen/qwen3-vl-8b --context-length 32768 --gpu max -y
# boot helper: docker/lmstudio-load-brain.sh
```

Скрипты `docker/lmstudio-switch.sh` / pipeline API (`/api/offerKp/pipeline/*`) могут оставаться для ops, но в single-model режиме приложение не обязано unload/load между OCR и чатом.

**Agent tools:** у Qwen3-VL native `tools[]` часто ломают Jinja в LM Studio → провайдер уходит в UnTooled (`lmStudioToolSupport.js`).

В `server/.env` (ориентир):

```
OFFER_KP_TEACHER_LLM=0
OFFER_KP_SINGLE_MODEL=true
LLM_PROVIDER=lmstudio
LMSTUDIO_BASE_PATH=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL_PREF=qwen/qwen3-vl-8b
OFFER_KP_PIPELINE_VISION_MODEL=qwen/qwen3-vl-8b
OFFER_KP_PIPELINE_AGENT_MODEL=qwen/qwen3-vl-8b
OFFER_KP_PIPELINE_AGENT_FALLBACK=qwen/qwen3-vl-8b
OFFER_KP_PIPELINE_AGENT_CONTEXT=32768
LMSTUDIO_MODEL_TOKEN_LIMIT=32768
```

### OpenRouter с Selectel

Прямой доступ к `openrouter.ai` с IP Lainey часто даёт `403`. Нужен egress-proxy вне блокировки + reverse SSH:

```bash
# на ноутбуке (EU):
node scripts/openrouter-egress-proxy.cjs
ssh -N -R 127.0.0.1:8787:127.0.0.1:8787 root@87.228.90.43
```

На сервере:

```
OPENROUTER_BASE_URL=http://127.0.0.1:8787/api/v1
COLLECTOR_HOTDIR=/opt/offer-kp/app/collector/hotdir
STORAGE_DIR=/opt/offer-kp/data
```

Collector systemd обязан иметь `Environment=STORAGE_DIR=...` (иначе crash loop).

---

## Обновление (CI/CD)

**Автоматически:** push в `main` → GitHub Actions `Deploy Selectel Lainey`
(`.github/workflows/deploy-selectel.yml`). Secret `LAINEY_SSH_KEY`.

**Вручную:**

```bash
yarn deploy:lainey
# = bash scripts/deploy-lainey-sync.sh
```

Frontend только с `VITE_API_BASE=/api`. Иначе в браузере Failed to fetch.

Ops: `offerkp` · `offerkp logs` · `offerkp cicd` · `offerkp metrics`.
