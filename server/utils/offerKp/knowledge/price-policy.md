---
name: Политика цен ShopDB для КП
description: Какие matchType могут нести цену в КП; запрет выдуманных SKU и чисел.
triggers: цена, price, shopdb, под заказ, exact, analog
---

# Политика цен (OfferKP)

Код-истина: `quoteDbPriceGate.js`, `exportGuards.js`, `AgentHarness.sanitizeOutgoingChat`. Markdown — для LLM.

## Жёсткие правила

1. **ShopDB-only** — цена только из каталога (live row), никогда из OCR/LLM/веба.
2. Цену получают только **`exact`** и **`analog`**.
3. `similar` / `size_mismatch` / `none` → без чужой цены; UI: «под заказ» / пусто.
4. Любая «Цена: N» в исходящем чате должна совпасть с разрешёнными ценами draft/catalog, иначе abstain.
5. Экспорт PDF/DOCX блокируется guards, если priced line без eligible matchType или без productId/SKU.

## Snapshot

Один `priceSnapshot` / retrievedAt на строку; chat summary и файлы КП должны опираться на один и тот же draft.
