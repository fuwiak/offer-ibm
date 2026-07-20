# OfferKP UI on Lainey (Selectel) — доступ из РФ без Railway в браузере

Railway (`*.up.railway.app`) из России часто недоступен. Lainey в Selectel (СПб)
имеет публичный IP — через него отдаём UI.

## Быстрый доступ (прокси)

На Lainey ставится nginx, который проксирует на Railway. Пользователи открывают
только IP Lainey (доступен из РФ).

**URL:** `http://87.228.90.43/`

### 1) Firewall Selectel

В панели Selectel для сервера Lainey откройте входящий TCP **80**
(и при необходимости **443**) на публичный IP `87.228.90.43`.

### 2) Консоль сервера

Selectel → Lainey → Console (VNC) → под root выполните:

```bash
curl -fsSL https://raw.githubusercontent.com/fuwiak/offer-ibm/main/scripts/deploy-lainey-ui-proxy.sh | bash
```

Или скопируйте скрипт из репозитория: `scripts/deploy-lainey-ui-proxy.sh`.

### 3) SSH (чтобы можно было деплоить без консоли)

Добавьте публичный ключ в `~/.ssh/authorized_keys` на Lainey
(через ту же Console), затем с локальной машины:

```bash
ssh root@87.228.90.43
```

## Полный self-host (позже)

Если Railway нельзя даже как upstream с Lainey — поднимайте Docker-стек на Lainey
(`docker/Dockerfile`, `LMSTUDIO_BASE_PATH=http://127.0.0.1:1234/v1`).
Прокси выше — минимальный путь «показать UI сейчас».
