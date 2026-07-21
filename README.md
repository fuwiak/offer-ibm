# OfferKP

Система формирования коммерческих предложений (КП) на крепёж: чат, разбор заявок (PDF/текст), подбор из каталога **ShopDB**, редактируемая сводка позиций, экспорт PDF/DOCX/XLSX.

**Прод:** [http://offer-ibm.ru](http://offer-ibm.ru) · Selectel Lainey (`87.228.90.43`)

Для агентов/Claude: [`claude.md`](./claude.md) · аудит: [`AUDYT.md`](./AUDYT.md) · UI: [`DESIGN.md`](./DESIGN.md)

---

## Что делает продукт

1. Оператор пишет в чат или прикрепляет заявку (PDF/Excel…).
2. **Intent-роутер** решает, нужен ли каталог/КП (casual без ShopDB; create/edit quote — с защитой цен).
3. Vision OCR + парсер извлекают позиции; **matching** ищет товары в ShopDB (SQL → TF-IDF → embedding → опционально LLM).
4. Справа: сводка позиций (все поля + **ПОКУПАТЕЛЬ**), превью КП, сверка с загруженным PDF.
5. Экспорт только после гейтов цен/источников; выдуманные «Цена: …» в чате абстинируются.

**ShopDB-only для КП:** без vector search и веб-enrich. Цену получают только `exact` / `analog`.

---

## Стек

| Часть | Технологии |
|-------|------------|
| Frontend | Vite + React (чат, DocumentPanel, PDF sidebar) |
| Server | Node.js + Express, Prisma (SQLite app-данных) |
| Каталог | ShopDB — MySQL (Shop-Script / purolat.com) |
| Collector | Парсинг / OCR вложений |
| LLM | LM Studio: резидентная `qwen/qwen3-vl-8b` на T4; опц. OpenRouter teacher |
| Прод | systemd `offer-kp` + `offer-kp-collector`, nginx → `:3001` |

Домен: `server/utils/offerKp/`. UI: `frontend/src/components/OfferKp/`.

---

## Структура репозитория

| Каталог | Назначение |
|---------|------------|
| `frontend/` | Веб-UI |
| `server/` | API, чат, ShopDB enrich, КП, agent harness |
| `collector/` | Документы / hotdir |
| `cli/` | `offerkp` — статус, логи, CI/CD, **metrics** ([cli/README.md](./cli/README.md)) |
| `docker/` | Lainey / LM Studio ([docker/LAINEY_UI.md](./docker/LAINEY_UI.md)) |
| `scripts/` | Деплой, measure/report ShopDB metrics |
| `test_files/` | Golden set экстракции + matching corrections |
| `chat-core/` | Вынесенное ядро чата (legacy-совместимость) |

---

## Локальная разработка

Node.js ≥ 18, Yarn.

```bash
yarn setup
# заполнить server/.env.development, frontend/.env, collector/.env
yarn dev
```

```bash
yarn test
yarn test:golden
yarn ops:install && offerkp
yarn deploy:lainey
```

### Env (минимум КП)

| Переменная | Зачем |
|------------|--------|
| `JWT_SECRET`, `SIG_KEY`, `SIG_SALT` | сессии |
| `LLM_PROVIDER=lmstudio` | локальная модель |
| `LMSTUDIO_BASE_PATH` | URL LM Studio |
| `OFFER_KP_SINGLE_MODEL=true` | один resident VL на T4 |
| `DB_*` | ShopDB MySQL |
| `SHOP_DB_ENRICH=1` | каталожный enrich |
| `SHOP_BASE_URL` | ссылки на товары |
| `SHOP_DB_EMBEDDING_SIMILARITY` | embedding rerank (1/0) |
| `SHOP_DB_GOLDEN_CORRECTIONS` | override из golden CSV |
| `SHOP_DB_METRICS_ENABLED` | JSONL метрик matching |

Полный список: `server/.env.example`.

---

## Как «учится» качество подбора

Без fine-tune весов:

1. **Golden CSV** (`matched_sku` / `match_type`) → override + few-shot.
2. **Knowledge MD** (`server/utils/offerKp/knowledge/`) → правила DIN/ГОСТ в LLM-fallback.
3. **Метрики** (`offerkp metrics`) → непрерывный снимок matchType/стратегий на проде.
4. Правки оператора в сводке позиций.

См. `test_files/README.md` и AUDYT §6–§10.

---

## Продакшен (Selectel Lainey)

- код `/opt/offer-kp/app`, данные `/opt/offer-kp/data`
- push `main` → GitHub Actions `Deploy Selectel Lainey`
- вручную: `yarn deploy:lainey`
- LLM: одна `qwen/qwen3-vl-8b` в VRAM (не dual swap) — детали в `docker/LAINEY_UI.md`
- OpenRouter с Lainey часто через egress-proxy

---

## Контакты (договор)

| Сторона | Контакт |
|---------|---------|
| Исполнитель (ИП Стасиньски П.К.) | stasinskipawel@yandex.ru |
| Заказчик (ООО «Веб Успех») | info@webuspex.info |
