# OfferKP Design System — продуктовый UI

Документ описывает **рабочий интерфейс OfferKP** (чат + панели КП), а не внешний marketing-сайт Claude.com.  
Токены и классы живут в `frontend/src/styles/carbon-theme.css` и компонентах `OfferKp` / `DocumentPanel`.

---

## Характер продукта

- Рабочее место оператора продаж: плотный, спокойный UI, акцент на сверке заявки и каталога.
- Палитра тёплая: крем / coral (`#cc785c`) / тёмные панели чата — наследство carbon/Claude-like темы AnythingLLM, адаптированное под КП.
- Основной язык интерфейса: **русский** (`frontend/src/locales/ru/offerKp.js`). Строки только через i18n.

---

## Layout (три–четыре колонки)

```
[ Sidebar ] | [ Chat / Диалог ] | [ Uploaded PDF ] | [ DocumentPanel ]
```

| Зона | Назначение |
|------|------------|
| Sidebar | Пространства, треды, навигация |
| Chat | Сообщения, вложения, статус matching |
| UploadedPdfSidebar | Исходный PDF заявки (сверка), resizable |
| DocumentPanel | Вкладки: Диалог · **Сводка позиций** · Превью КП · Document/PDF |

На `lg+` панели видны; на узких экранах — collapse. Ширины PDF/doc панелей — в `localStorage`.

---

## Цвета (практические)

| Роль | Пример | Где |
|------|--------|-----|
| Primary / CTA | `#cc785c` | кнопки экспорта, акценты табов |
| Teal / brand KP | `#0c7d69` | шапка документа КП, заголовки таблицы в превью |
| Navy текст дока | `#1b2f5a` | сильные лейблы в `offerKp-quote-doc` |
| Canvas / input | theme tokens `--theme-bg-*` | фон чата и инпутов |
| Borders | `--theme-sidebar-border` | разделители панелей |
| Status OK | тёплый cream + terracotta | `.offerKp-status--ok` |
| Status review | muted cream | `.offerKp-status--review` |
| Status none | soft red | `.offerKp-status--none` |

Не вводить фиолетовые градиенты и «AI purple» — держать coral/teal/cream.

---

## Типографика

- UI: системный/теманый sans (Carbon/theme stack), размеры 10–13px в плотных панелях, 12–14px в чате.
- Документ КП (`.offerKp-quote-doc`): компактный печатный вид, uppercase labels 9px letter-spacing.
- Моноширинный текст — только превью OCR / parsed text.

---

## Компоненты КП

### Сводка позиций (`QuoteDraftTable`)

- Sticky thead, editable cells (имя, артикул, кол-во, ед., цена, сумма, вес, статус, комментарий).
- Полоска **ПОКУПАТЕЛЬ** над таблицей: имя + страна (`offerKp-draft-customer`).
- Чекбокс подтверждения позиций «требует проверки» перед экспортом.
- Кнопки DOCX / PDF / XLSX / Превью.

### Превью КП (`QuotePreview`)

- Печатный макет: ПОСТАВЩИК | **ПОКУПАТЕЛЬ** (inline inputs, не «—»).
- Таблица позиций, итоги, условия.
- Покупатель пишется в `quoteDraft.customer` и уходит в экспорт.

### Uploaded PDF

- PDF.js canvas, выбор файла, resize handle + narrow/widen.
- Цель: side-by-side с сводкой.

### Статусы matching

Классы `.offerKp-status--*`; select статусов из `OFFER_KP_QUOTE_STATUSES`.

---

## Паттерны UX

1. **Одна работа на панель:** чат = диалог; сводка = правка строк; PDF = сверка; превью = вид документа.
2. **Inline edit** предпочтительнее модалок для покупателя и ячеек таблицы.
3. **Не карточки ради карточек** — границы только где нужна зона ввода или разделение панелей.
4. Долгие этапы (OCR / matching) — показывать progress stage в панели, не молчаливый спиннер (см. AUDYT §2).
5. Не хардкодить PL/EN строки в JSX.

---

## CSS-якоря

- `.offerKp-uploaded-pdf-panel`, `__resizer`
- `.offerKp-document-panel`, `.offerKp-doc-tab`
- `.offerKp-draft-table`, `.offerKp-draft-customer`
- `.offerKp-quote-doc`, `__parties`, `__buyer`, `__edit-input`
- `.offerKp-status--ok|analog|order|none|review`

Тема: `frontend/src/styles/carbon-theme.css`.

---

## Do / Don’t

**Do:** русские лейблы; editable покупатель; сверка с PDF; coral/teal акценты; сохранять `quoteDraft` в storage треда.

**Don’t:** пустой «—» у покупателя без способа заполнить; выдуманные цены в UI; cool-gray «generic SaaS»; Inter/Roboto как display hero на лендинге (лендинг — отдельная поверхность, если появится).

---

## Связанные файлы

- `frontend/src/components/OfferKp/*`
- `frontend/src/components/DocumentPanel/index.jsx`
- `frontend/src/layouts/OfferKpLayout/index.jsx`
- `frontend/src/locales/{ru,en,pl}/offerKp.js`
