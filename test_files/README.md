# Golden set — эталонные заявки

Набор реальных заявок клиентов для двух целей:

1. **Экстракция** — `parseInquiryText` (`parseInquiry.js`): наименование, ед., кол-во.  
   Раннер: `server/__tests__/utils/offerKp/goldenSet.test.js` · `yarn test:golden`.
2. **Matching (обучение без fine-tune)** — опциональные колонки CSV кормят  
   `goldenCorrections.js` (override SKU) и `goldenFewShot.js` (few-shot в LLM-fallback).

Примеры никогда не `skipped`: отсутствие эталона/фикстуры — ошибка CI.

---

## Новый эталон

Папка `test_files/<Name>/`:

```
test_files/<Name>/
  <Name>.pdf                 # исходник клиента
  <Name>.expected.csv        # эталон
```

Плюс фикстура текста после OCR:

`server/__tests__/fixtures/offerKp/<slug>-table.txt`  
(`Slozhnost_vysokaya_1` → `slozhnost-vysokaya-1-table.txt`).

### CSV экстракции (обязательно)

```csv
nr,source_name,unit,quantity
1,"Болт М10х100 (S16) ГОСТ 7805-70 ...","кг",30
```

### CSV matching (опционально, для «обучения»)

```csv
nr,source_name,unit,quantity,matched_sku,matched_name,match_type
1,"...","кг",30,011144100100097,"Болт ...",exact
```

- `match_type`: `exact` | `analog` | `none`
- **Цена в CSV не хранится** — в рантайме всегда из ShopDB по SKU.
- Если SKU пропал из каталога — pipeline падает в обычный поиск.
- Файлы без matching-колонок по-прежнему валидны для экстракции; override их просто игнорирует.

Также поддерживаются: `<Name>_scraped.txt`, пара `<Name>.txt` + `<Name>.expected.csv`.

```bash
yarn test:golden
```

---

## Что репортит goldenSet.test.js

- Построчное совпадение имя/ед./кол-во.
- Сводка % полностью корректных позиций и % с верными кол-во/ед.

Гонять после правок парсера/OCR-промпта.

---

## Matching в проде / метрики

Живой matching (`matchInquiryLines`) пишет события в  
`storage/metrics/shopdb-search.jsonl` → `offerkp metrics` /  
`node scripts/report-shopdb-metrics.cjs`.

Ручные правки оператора в сводке позиций + заполнение `matched_sku` в golden —  
главный способ растить качество без LoRA.
