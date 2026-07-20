# OfferKP UI на Lainey (Selectel only)

**URL:** http://offer-ibm.ru/ (и http://87.228.90.43/)

Стек на сервере Lainey (`87.228.90.43`), **без Railway**:

- nginx `:80` → Node app `:3001`
- systemd: `offer-kp.service`, `offer-kp-collector.service`
- код: `/opt/offer-kp/app`
- данные: `/opt/offer-kp/data`
- collector hotdir: `/opt/offer-kp/app/collector/hotdir`
- LLM: OpenRouter teacher через egress-proxy (см. ниже) / LM Studio `127.0.0.1:1234` когда запущен

## LLM on Lainey

- **LM Studio** (`lms server` on `:1234`) — primary when `OFFER_KP_TEACHER_LLM=0`
- **OpenRouter** via egress `:8787` — used when teacher=1, or as fallback if LM Studio is down

Start / enable LM Studio:

```bash
export PATH="/root/.lmstudio/bin:$PATH"
lms server start --port 1234
lms load qwen/qwen3-vl-8b-thinking --gpu max
# optional systemd unit: lmstudio-server.service
```

In `server/.env`:

```
OFFER_KP_TEACHER_LLM=0
LLM_PROVIDER=lmstudio
LMSTUDIO_BASE_PATH=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL_PREF=qwen/qwen3-vl-8b-thinking
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
