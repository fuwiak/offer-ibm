# OfferKP UI на Lainey (Selectel only)

**URL:** http://offer-ibm.ru/ (и http://87.228.90.43/)

Стек на сервере Lainey (`87.228.90.43`), **без Railway**:

- nginx `:80` → Node app `:3001`
- systemd: `offer-kp.service`, `offer-kp-collector.service`
- код: `/opt/offer-kp/app`
- данные: `/opt/offer-kp/data`
- collector hotdir: `/opt/offer-kp/app/collector/hotdir`
- LLM: OpenRouter teacher через egress-proxy (см. ниже) / LM Studio `127.0.0.1:1234` когда запущен

## OpenRouter 403 с Selectel

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

## Обновление

С ноутбука (SSH ключ разблокирован):

```bash
cd frontend && VITE_API_BASE=/api yarn build && cd ..
rsync -az --delete --exclude node_modules --exclude .git \
  --exclude '**/storage/**' \
  -e 'ssh -o BatchMode=yes' \
  ./ root@87.228.90.43:/opt/offer-kp/app/
ssh root@87.228.90.43 'cp -a /opt/offer-kp/app/frontend/dist/. /opt/offer-kp/app/server/public/ && systemctl restart offer-kp offer-kp-collector'
```

Важно: production-сборка только с `VITE_API_BASE=/api`. Если оставить `localhost:3001`, в браузере будет Failed to fetch.
