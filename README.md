# OfferKP

Система формирования коммерческих предложений (КП) на крепёж: чат-интерфейс, разбор заявок (PDF/текст), подбор позиций из каталога **ShopDB**, черновик КП и экспорт PDF/DOCX.

**Продакшен:** [http://offer-ibm.ru](http://offer-ibm.ru) (Selectel Lainey, `87.228.90.43`)

---

## Что делает продукт

1. Оператор загружает заявку (чат, PDF, Excel и т.д.) или пишет запрос текстом.
2. Система парсит позиции и сопоставляет их с каталогом Shop-Script (MySQL).
3. В UI появляется черновик КП (таблица: наименование, кол-во, цена, вес, статус).
4. Оператор правит позиции; система генерирует КП в корпоративном формате.

Для запросов КП используется **режим ShopDB-only**: без vector search и веб-enrich, чтобы цены не галлюцинировались. Цену получают только совпадения `exact` / `analog`; `similar` / `size_mismatch` — «под заказ» без чужой цены.

---

## Стек

| Часть | Технологии |
|-------|------------|
| Frontend | Vite + React (чат, панель черновика КП, админка) |
| Server | Node.js + Express, Prisma (SQLite для app-данных) |
| Каталог | ShopDB — MySQL (Shop-Script), enrich + search agent |
| Collector | Парсинг/OCR вложений |
| LLM | LM Studio (локально) и/или OpenRouter (teacher); на Selectel — egress-proxy при 403 |
| Прод | systemd на Lainey: `offer-kp` + `offer-kp-collector`, nginx → `:3001` |

Репозиторий вырос из AnythingLLM-подобного монорепо; доменная логика КП — в `server/utils/offerKp/`, UI — в `frontend/src/components/OfferKp/`.

---

## Структура репозитория

| Каталог | Назначение |
|---------|------------|
| `frontend/` | Веб-UI |
| `server/` | API, чат-пайплайн, ShopDB enrich, PDF КП |
| `collector/` | Обработка документов / hotdir |
| `cli/` | `offerkp` — TUI статус/логи/CI/CD Selectel ([cli/README.md](./cli/README.md)) |
| `docker/` | Образ и заметки по Lainey ([docker/LAINEY_UI.md](./docker/LAINEY_UI.md)) |
| `scripts/` | Деплой на Lainey, OpenRouter egress-proxy |
| `shopDb/` | Утилиты/обогащение каталога |
| `test_files/` | Золотые кейсы matchingu заявок |
| `chat-core/` | Вынесенное ядро чата (оркестратор / промпты) |

---

## Локальная разработка

Требования: **Node.js ≥ 18**, **Yarn**.

```bash
yarn setup          # зависимости + .env из примеров + prisma
# заполнить server/.env.development, frontend/.env, collector/.env

yarn dev            # server + frontend + collector
# или: yarn dev:server / yarn dev:frontend / yarn dev:collector
```

Полезные команды:

```bash
yarn test
yarn prisma:setup
yarn prisma:reset
yarn ops:install    # CLI offerkp → ~/bin
yarn ops            # TUI мониторинга Lainey
```

### Минимальные env для КП

В `server/.env` / `.env.development`:

| Переменная | Зачем |
|------------|--------|
| `JWT_SECRET`, `SIG_KEY`, `SIG_SALT` | сессии / подписи |
| `LLM_PROVIDER` | обычно `lmstudio` или `openrouter` |
| `LMSTUDIO_*` / `OPENROUTER_*` | доступ к модели |
| `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | ShopDB (MySQL) |
| `SHOP_DB_ENRICH=1` | включить каталожный enrich |
| `SHOP_BASE_URL` | ссылки на товары (напр. purolat.com) |
| `ELI_DISABLED=1` | для OfferKP — не уводить PL-запросы в ELI |

Полный список — в `server/.env.example` (секция offer-kp / ShopDB).

---

## Продакшен (Selectel Lainey)

Целевая среда — **не Railway**, а VPS Lainey:

- код: `/opt/offer-kp/app`
- данные: `/opt/offer-kp/data`
- сервисы: `offer-kp.service`, `offer-kp-collector.service`
- UI: nginx `:80` → app `:3001`

**Автодеплой:** push в `main` → GitHub Actions `Deploy Selectel Lainey` (`.github/workflows/deploy-selectel.yml`, secret `LAINEY_SSH_KEY`).

**Вручную:**

```bash
yarn deploy:lainey
# = bash scripts/deploy-lainey-sync.sh
```

Сборка фронта только с `VITE_API_BASE=/api`. Подробности: [docker/LAINEY_UI.md](./docker/LAINEY_UI.md).

### OpenRouter с Selectel

Прямой доступ к `openrouter.ai` с IP Lainey часто даёт `403`. Нужен egress-proxy вне блокировки + reverse SSH — см. `docker/LAINEY_UI.md` и `scripts/openrouter-egress-proxy.cjs`.

---

## Ops CLI

```bash
yarn ops:install
offerkp              # статус / health
offerkp build        # лог деплоя
offerkp logs         # journalctl
offerkp cicd         # GitHub Actions
```

После `git commit` хук показывает live-статус Lainey (отключить: `OFFERKP_OPS_SKIP=1`).

---

## Тесты качества подбора

```bash
yarn test
yarn test:golden    # goldenSet по test_files/
```

Кейсы в `test_files/` (в т.ч. `.expected.csv`) — основной способ ловить регрессии matchingu ГОСТ/DIN, аналогов и OCR.

---

## Контакты (договор)

| Сторона | Контакт |
|---------|---------|
| Исполнитель (ИП Стасиньски П.К.) | stasinskipawel@yandex.ru |
| Заказчик (ООО «Веб Успех») | info@webuspex.info |
