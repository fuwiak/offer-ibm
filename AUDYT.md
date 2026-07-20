# Аудит offer-ibm (2026-07-20)

Область: скорость web UI, качество UI/UX, качество генерации и агента (flow: загрузка PDF → сопоставление товаров в ShopDB → генерация КП).
Метод: статический аудит кода (живой тест http://offer-ibm.ru/ требует расширения Claude in Chrome — сайт SPA, сам HTML пустой).

---

## 1. Скорость web UI

### Внедрённые правки ✅

| # | Изменение | Файл | Эффект |
|---|-----------|------|--------|
| 1 | Вырезание 20 неиспользуемых языков из entry bundle (UI поддерживает ru/pl/de/fr/kk + en) | `frontend/src/locales/resources.js` | ~1,5 MB меньше исходников в главном bundle (~200–400 KB меньше после минификации, меньше JS на парсинг при старте) |
| 2 | Заголовки `Cache-Control`: хэшированные чанки → `immutable, 1y`; `index.js`/`index.css`/HTML → `no-cache` (ETag/304); остальное → 1 день | `server/index.js` | Повторные визиты не качают чанки заново; entry валидируется через 304 |
| 3 | Дешёвый comparator `memo` — `JSON.stringify` больших RAG-источников считался для каждого сообщения на каждом chunk стрима | `frontend/.../HistoricalMessage/index.jsx` | Плавнее стриминг в длинных диалогах |

**Нужен rebuild фронтенда (`yarn prod:frontend`) и deploy, чтобы правки 1 и 3 попали на прод.**

### Что сделать (по убыванию приоритета)

1. **HTTPS/HTTP2.** Сайт ходит по `http://`. Помимо безопасности: нет HTTP/2 (медленнее параллельная загрузка чанков), нет PWA, нет clipboard API. Railway даёт TLS из коробки — настройте домен с сертификатом. *Самый большой одиночный выигрыш.*
2. **Brotli.** `compression()` в Node — только gzip. Entry 1,1 MB → gzip ~330 KB, brotli ~260 KB. Проще всего: CDN/nginx перед Node или прекомпрессия в build (`vite-plugin-compression`) + раздача `.br`.
3. **Entry bundle всё ещё ~1,1 MB.** После вырезки locales станет легче, но в entry статически импортируется всё из `main.jsx`. После сборки откройте `frontend/bundleinspector.html` и вырежьте следующих кандидатов (напр. `moment` — в 9 файлах, замена на `dayjs` или нативный `Intl` ≈ −60 KB; KaTeX/highlight в markdown — lazy).
4. **Ассеты без хэшей.** `assetFileNames` в `vite.config.js` возвращает исходные имена (шрифты, картинки) — поэтому у них только 1-дневный cache. Верните хэширование по умолчанию — тогда попадёт под `immutable`.
5. **Двойной scroll-handler** в `ChatHistory` (`onScroll={handleScroll}` + отдельный listener с `debounce`, создаваемый на каждый render) — мелочь, убрать.

---

## 2. UI/UX

### Проблемы

1. **Нет обратной связи на самом долгом этапе.** Enrich (parse PDF → matching строк → search agent) может идти десятки секунд, а первый сигнал пользователю (`offerKpQuotePanel`, `progressStage: "matched"`) приходит только ПОСЛЕ сопоставления. До этого — спиннер. **Рекомендация:** эмитить этапы раньше — `parsing` (после чтения PDF, с числом распознанных позиций), `searching` (старт matching, напр. счётчик «строка 12/40»). Бэкенд уже имеет SSE-канал и тип события — в основном дописать 2 эмиссии в `enrichInquiryLinesFromPdf` + обработку состояний в панели.
2. **Спиннер после конца ответа.** После последнего токена сервер ещё ждёт: post-processing → генерацию артефактов PDF/DOCX → **LLM follow-up suggestions** — и только потом шлёт `finalizeResponseStream`. Ответ выглядит «зависшим». **Рекомендация:** финализировать стрим сразу после артефактов, follow-up слать отдельным событием после факта (не блокируют запись чата).
3. **Meta/og-теги.** В `MetaGenerator` стоит `og:url: https://offer-kp.local` (placeholder) — превью ссылки в мессенджерах будет сломано. Dev `index.html` всё ещё брендирован «AnythingLLM».
4. **Auto-scroll при стриме** опирается на порог 2 px от низа — при быстром стриме с картинками/таблицами может «убегать». Наблюдать после внедрения progress-stage.

### Что хорошо

Lazy routing на уровне роутера, панель черновика КП пушится во время стрима, карточки файлов (Preview/Download) в чате, языковые версии с миграцией на ru.

---

## 3. Качество генерации и агента

### Что хорошо (не ломать)

- **Режим ShopDB-only для КП** — при запросе КП отключает vector search и web enrich, закрывая путь галлюцинаций цен. Триггер срабатывает и от одного прикреплённого PDF (`parsedTextHasQuoteSignals`), не только от фразы.
- **Правило цен:** только `exact`/`analog` получают цену из каталога; `similar`/`size_mismatch` → «под заказ» без подстановки чужой цены; подсказка похожего товара без его цены в строке КП. Это корректный дизайн.
- Per-line matching с fallback (search agent → ShopDB SQL agent), ошибка одной строки не валит остальные (`buildLineMatchErrorFallback`).
- Style-polish **пропускается** для КП (второй проход LLM не переписывает числа) — правильно.
- Отдельный каталожный промпт с жёсткими запретами («не пиши, что нет доступа к базе»).

### Риски / правки

1. **Латентность enrich = главное узкое место.** `SHOP_DB_ENRICH_TIMEOUT_MS` по умолчанию 60 с **+ полный retry после timeout** → до 120 с до первого токена. На большой заявке: N строк × (SQL search + возможный LLM fallback `searchAgent`) при `OFFER_KP_MATCH_CONCURRENCY=4`. **Рекомендации:** (a) снизить дефолтный timeout до ~30 с, retry только для упавшей фазы, не всего enrich; (b) поднять concurrency для запросов >20 строк (SQL выдержит); (c) кэш результатов matching строк per (текст строки → productId) в рамках треда — follow-up «добавь позицию 5» не должны пересчитывать всё с нуля.
2. **Двойные токены из PDF.** Полный текст вложения идёт в `contextTexts` («ПРИКРЕПЛЁННЫЙ ДОКУМЕНТ») *и параллельно* его позиции возвращаются блоками `[Каталог · PDF]`. В режиме КП с готовым draft сократите сырой текст PDF (напр. шапка + подвал + нераспознанные позиции) — меньше промпт, меньше стоимость, меньше конфликтов источников.
3. **Хрупкий re-parsing своего формата.** `autoQuoteArtifacts.parseCatalogBlock` вытаскивает цену/URL regex'ами из текста блока каталога, который сам сгенерировал `buildProductExcerpt`. Смена формата блока тихо сломает артефакты. **Рекомендация:** передавать структурные данные (объект товара) рядом с текстом блока вместо парсинга строки.
4. **Доп. вызовы LLM на request:** `quoteIntentJudge`, `searchAgent` fallback (на строку!), follow-up suggestions, OCR vision. Каждый — стоимость и латентность. Стоит добавить сводный счётчик в `metrics`/`ragTrace` (сколько sub-вызовов LLM на ответ), чтобы видеть регрессии.
5. **Тесты качества matching.** Есть harness (`test_files/*.expected.csv`) — расширьте кейсами: аналоги DIN↔ГОСТ, размер без покрытия, позиции вне каталога, PDF после OCR с ошибками. Это самый дешёвый способ держать качество КП при смене промптов.

---

## 4. Следующие шаги

1. Rebuild + deploy (изменения из раздела 1).
2. HTTPS + brotli (инфра, без правок кода).
3. Progress-stage в enrich + finalize до follow-up (самый большой скачок ощущаемого качества).
4. Timeout/concurrency/cache в matching.
5. Живой тест: после подключения расширения Claude in Chrome можно замерить реальные времена загрузки и пройти весь flow КП на offer-ibm.ru.

---

## 5. Дополнение (2026-07-21): сильные/слабые стороны бэкенда, техники ускорения, оценка вакансии ML

Область расширена по запросу: полный аудит трёх подсистем (чтение файлов/OCR, matching ShopDB, генерация LLM) + внешний research (web search) по техникам ускорения + оценка, помогут ли компетенции из описания вакансии ML Engineer (BERT/LoRA/PEFT, matching/retrieval, quantization) этому проекту.

### 5.1 Сильные стороны (не ломать)

| Область | Что хорошо |
|---|---|
| OCR (`collector/utils/OCRLoader`, `SmartOCRAgent`) | 2-страничный «probe» перед полным OCR (early-abort на нечитаемом скане), worker-pool до 4 потоков Tesseract с очередью страниц, waterfall из 9 стратегий вместо одного жёсткого пути |
| `parseCache` (`collector/utils/parseCache`) | Кэш по fingerprint файла (размер + байтовые пробы) — тот же PDF второй раз не проходит re-OCR |
| Matching ShopDB (`shopDbSearch.js`) | 5 SQL-стратегий идут параллельно (`Promise.all`), не последовательно |
| Кэширование в matching | Три независимых слоя: `ShopDbQueryCache` (SQL), `agentResultCache` (результаты агента), `lineMatchCache` per-тред (follow-up «добавь позицию 5» не пересчитывает всё) |
| `SHOP_DB_SEARCH_AGENT_LLM=0` по умолчанию | Самый дорогой путь (LLM на строку) **выключен по умолчанию** — осознанное решение по стоимости, не упущение |
| Streaming + keepalive | Основной ответ стримится end-to-end; 15 с keepalive в SSE держит соединение через многоэтапный post-processing вместо обрыва |
| `skipStylePolish` для КП | Второй проход LLM не трогает числа в документе — верная защита данных |
| `OFFER_KP_MATCH_CONCURRENCY` | Осознанно низкий default (1–2), потому что «маленький pool MySQL» — не упущение производительности, а trade-off стабильность > скорость |

### 5.2 Слабые стороны / риски

1. **Matching на 100% лексика, ноль эмбеддингов.** `nameSimilarity.js` считает TF-IDF cosine + Levenshtein вручную в JS — это не семантический поиск, а продвинутое текстовое сопоставление. Синонимы, варианты транслитерации (ГОСТ/GOST), парафразы позиций вне каталога всё равно уходят в LLM-fallback (`searchAgent.pickProductsWithLlm`, per строка, последовательно). Это главный рычаг улучшения — см. 5.4.
2. **До 6+N последовательных round-trip LLM на одно сообщение**: quote-intent judge → per-line LLM fallback (если включён) → генерация → Yandex fact-check → OpenRouter/ГАРАНТ fact-check → style-polish → follow-up suggestions. Fact-check шаги (Yandex и OpenRouter/ГАРАНТ) работают над **одним и тем же** сгенерированным текстом независимо, но идут последовательно (`generation.js`, шаги 12a→12b) вместо `Promise.all` — чистая правка в коде, без новой инфраструктуры, сокращает критический путь на полный round-trip.
3. **Нет prompt/KV cache у реально используемых провайдеров.** `cache_control` (Anthropic-style prompt caching) есть только в `AiProviders/anthropic`, который прод не использует — LM Studio и OpenRouter (фактические провайдеры) ничего не имеют. Большой общий системный блок (инструкции ГАРАНТ/Yandex/Google + RAG) считается с нуля на каждый request.
4. **Один T4 16GB делится между vision и chat через полный unload/reload** (`lms unload --all` → `lms load`, `docker/lmstudio-switch.sh`). Каждое переключение OCR-vision ↔ chat — несколько–десятки секунд мёртвого времени, без перекрытия запросов.
5. **LM Studio вместо движка с continuous batching.** Нет PagedAttention/prefix caching класса vLLM или `llama-server` — при параллельных пользователях и большом общем префиксе промпта это прямая потеря пропускной способности.
6. `parseCache` только в памяти, 50 записей, restart чистит всё — для реального workflow (retry, тот же PDF клиента второй раз) кэш быстро «вымывается».
7. Хрупкий re-parsing формата каталожного блока (`autoQuoteArtifacts.parseCatalogBlock`) — уже отмечено в разделе 3, по-прежнему актуально как риск процессинга.

### 5.3 Техники ускорения — из внешнего research, привязанные к конкретному коду

**Генерация LLM**
- `Promise.all` для Yandex fact-check + OpenRouter/ГАРАНТ fact-check вместо последовательных `await`/`await` в `generation.js` — ноль новой инфры, один round-trip меньше на критическом пути.
- Prefix/KV-cache reuse: у `llama-server` (llama.cpp) есть `--prompt-cache` и slot-matching по сходству префикса промпта — в публичных бенчмарках TTFT падает с ~1,7 с до ~0,03 с при попадании в кэш. При большом, в основном постоянном system-prompt этого проекта (инструкции ГАРАНТ/Yandex/Google) это напрямую бьёт в п. 5.2.3. [Tutorial: KV cache reuse with llama-server](https://github.com/ggml-org/llama.cpp/discussions/13606)
- vLLM с `--enable-prefix-caching` даёт ~30% throughput при общем system-prompt «бесплатно» (один флаг) — рассмотреть как замену/дополнение LM Studio при многих параллельных сессиях. [vLLM Optimization for Scalable Scheduling, Batching & Concurrent Inference](https://medium.com/@abonia/vllm-optimization-for-scalable-scheduling-batching-concurrent-inference-a050f3ab1f06)

**Matching ShopDB (retrieve → rerank вместо LIKE + LLM-per-строка)**
- Классический паттерн: bi-encoder (sentence-transformers) считает эмбеддинги всего каталога **один раз**, запрос кодируется на лету, top-K по cosine за миллисекунды; cross-encoder дотягивает только top ~10 кандидатов перед возможным LLM. [Retrieve & Re-Rank — Sentence Transformers docs](https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html)
- Каталог в MySQL и, вероятно, < 100k SKU — отдельная векторная БД не нужна. По философии проекта (все кэши in-memory) проще всего ANN in-process (напр. `hnswlib-node`/`usearch`) рядом с существующими SQL LIKE-стратегиями, а не отдельная инфраструктура. FAISS не поддерживает гибрид BM25+вектор нативно; pgvector потребовал бы Postgres, которого здесь нет. [Hybrid Search in 100 Lines: BM25 + pgvector with RRF](https://dev.to/gabrielanhaia/hybrid-search-in-100-lines-bm25-pgvector-with-rrf-merge-58cn)
- Важный вывод из research: эмбеддинги «размывают» идентификаторы/SKU/коды ГОСТ — поэтому существующие стратегии `exact_sku`/`structured`/`keywords` (лексические) **не должны** исчезнуть, а остаться «sparse»-ногой гибрида, dense (эмбеддинги) — второй ногой, слияние (RRF) в конце. Половина гибрида уже есть в коде.

**Чтение файлов / OCR**
- Tesseract.js остаётся верным выбором как CPU-bound fallback (малый footprint, работает везде) — литература это подтверждает. Ускорение имеет смысл только если у collector реально есть доступ к GPU T4 (проверить) — тогда PaddleOCR (~120 стр/мин на RTX 3090 vs ~25 стр/мин Tesseract на CPU) или Surya (лучше на layout-heavy документах) дают реальный выигрыш на тяжёлых сканах. Не внедрять вслепую — сначала замерить, как часто SmartOCRAgent вообще уходит в полный OCR (probe уже должен это ограничивать). [PaddleOCR vs Tesseract vs EasyOCR: OCR Speed and Accuracy 2026](https://www.codesota.com/ocr/paddleocr-vs-tesseract)

**GPU / quantization**
- Более агрессивная квантизация (AWQ/GPTQ 4-bit) vision-модели (`qwen3-vl-8b`, сейчас ctx 8192) могла бы уйти ниже ~5–6 GB, что при 16 GB T4 позволило бы держать **обе** модели (eyes + brain) резидентными одновременно и убрать `lms unload --all`/`lms load` на каждое переключение — вероятно, самая ценная инфраструктурная правка всего аудита, потому что снимает жёсткий синхронный stall с каждого запроса, смешивающего OCR-vision и чат. [Running Multiple LLMs Simultaneously: GPU Memory Management](https://dasroot.net/posts/2026/03/running-multiple-llms-gpu-memory-management/)

### 5.4 Помогут ли техники из описания вакансии (BERT/LoRA/PEFT, matching, quantization, multi-GPU) этому проекту?

Кратко: **да, в части matching/retrieval — почти учебное попадание в разделы 5.2.1/5.3**; остальное описание вакансии завышено относительно текущей шкалы проекта.

| Компетенция из описания | Соответствие проекту |
|---|---|
| Дообучение BERT с LoRA/PEFT | **Высокое.** Дообучение маленького bi-encoder на парах (строка заявки ↔ подобранный товар) из существующего golden set `test_files/*.expected.csv` + логов прод-matching реалистично на скромном доменном наборе — именно там LoRA лучше full fine-tuning (сообщают +1,6–4,6 пп out-of-domain vs full FT). |
| Matching-модели: генерация кандидатов, ranking, offline/online валидация | **Высокое.** Это 1:1 описание того, что сегодня вручную делает `productSearchAgent.js` (SQL LIKE + TF-IDF + LLM). Bi-encoder (кандидаты) + cross-encoder (ranking) + расширение golden set (offline валидация, уже в разделе 3.5 как «сделать») — естественное расширение роли. |
| Bi-encoder / cross-encoder | **Высокое.** Прямо закрывает 5.2.1 — см. 5.3. |
| Оптимизация инференса: quantization, distillation | **Среднее/высокое.** Прямо бьёт в проблему общего T4 (5.2.4) — quantization vision-модели, возможно distillation локальной agent-модели под меньший footprint. |
| Multi-GPU / distributed training | **Низкое здесь и сейчас.** Проект на одном T4 только для инференса; дообучение маленького bi-encoder LoRA помещается на одном GPU (даже том же T4, вне пика). Важно только при реальном тренинге больших моделей с нуля. |
| Uplift-modeling, highload ML-системы | **Низкое.** Это чатбот-КП для одного магазина, не система рекомендаций/прайсинга с treatment/control на большой шкале. |

**Вывод для найма:** если вакансия финансирует работу над этим репо, взвешивайте критерии в сторону matching/retrieval + PEFT (это реальный, выявленный техдолг), а multi-GPU/uplift/highload считайте «nice to have», не «must have» — иначе риск нанять профиль, не совпадающий с фактической шкалой задачи.

### 5.5 Приоритеты (дополнение)

1. `Promise.all` для двух fact-check (5.2.2) — самая дешёвая правка, один PR.
2. Замерить реальную частоту полного OCR и LLM-fallback per строка (сейчас нет счётчика — см. п. 3.4 основного аудита) **до** инвестиций в bi-encoder/квантизацию — без данных неясно, какой cost больнее.
3. ~~Прототип bi-encoder + ANN in-process для ShopDB matching~~ ✅ **Сделано 2026-07-21** — см. 5.6.
4. Квантизация vision-модели под со-резидентность с chat-моделью на T4 — убирает stall переключения.
5. `llama-server`/vLLM prefix-caching как альтернатива LM Studio, если число параллельных сессий начнёт расти.

### 5.6 Внедрение: лёгкий embedding-reranking в matching (2026-07-21)

Добавлен как **дополнительный, опциональный слой поверх** существующего TF-IDF/Levenshtein/Jaro-Winkler — структура `nameSimilarity.js`/`shopDbSearch.js` (SQL LIKE, кластеризация `productsAreSimilar`/`pickCheaperAmongSimilar`) не тронута.

- **Новый файл:** `server/utils/offerKp/embeddingSimilarity.js` — модель `MintplexLabs/multilingual-e5-small` через `@xenova/transformers` (та же библиотека и механизм загрузки/fallback, что у существующего `NativeEmbedder` в `server/utils/EmbeddingEngines/native`, переиспользован через подкласс с переопределённым `getEmbeddingModel()` — ноль правок в существующем RAG-embedder). CPU-only, не трогает GPU/LM Studio/T4.
- **Точка встройки:** `nameSimilarity.js#searchByNameSimilarity` — новая функция `applyEmbeddingBoost` переранжирует **уже отфильтрованных TF-IDF** кандидатов (не сырой пул SQL LIKE, остаётся «лёгким»), смешивая `_nameSimilarity = max(base, base·(1-w) + cosine·w)`, по умолчанию `w=0.3`.
- **Кэш:** отдельная in-memory карта эмбеддингов товаров (TTL 24ч, 4000 записей) в том же стиле, что `ShopDbQueryCache`/`lineMatchCache` — названия товаров меняются редко, повторные запросы не re-embed'ят весь каталог.
- **Fail-safe:** любая ошибка (нет сети при первой загрузке модели ~487MB и т.п.) отключает embedding-boost на остаток процесса, pipeline **молча возвращается к чистому TF-IDF** — поведение как до правки. Kill-switch: `SHOP_DB_EMBEDDING_SIMILARITY=0`.
- **Env vars:** `SHOP_DB_EMBEDDING_SIMILARITY`, `SHOP_DB_EMBEDDING_MODEL`, `SHOP_DB_EMBEDDING_WEIGHT`, `SHOP_DB_EMBEDDING_MAX_CANDIDATES`, `SHOP_DB_EMBEDDING_CACHE_TTL_MS`, `SHOP_DB_EMBEDDING_CACHE_MAX_ENTRIES` — см. `server/.env.example` (секция ShopDB).
- **Тесты:** `server/__tests__/utils/offerKp/embeddingSimilarity.test.js` (kill-switch, пустые входы — без сети). Полный `server/__tests__/utils/offerKp/*` (367 тестов, включая `goldenSet.test.js`) проходит без изменений.
- **Осознанный scope:** reranking работает только по кандидатам, которых SQL LIKE вообще нашёл (есть общий токен) — это **не** полный семантический retrieve кандидатов (эмбеддинг как первая нога «retrieve»), а улучшение порядка/качества среди уже найденных. Полный retrieve-by-embedding (ANN над всем каталогом) — большая правка, всё ещё открыта в 5.3/5.5.

---

## 6. Цикл обучения без fine-tuning + аудит «Чтение документа...» (2026-07-21, дополнение 2)

### 6.1 Golden set как источник правок matching (без тренировки моделей)

Контекст: `test_files/*.expected.csv` до сих пор валидировал **только экстракцию** (`source_name/unit/quantity`, см. `test_files/README.md`) — ничего из добавленных примеров не влияло на качество сопоставления с каталогом. Добавлены два механизма, которые реально «учатся» на примерах без тренировки любой модели:

1. **Таблица коррекций (override)** — `server/utils/offerKp/goldenCorrections.js`. Расширяет существующую схему CSV опциональными колонками `matched_sku,matched_name,match_type` (exact/analog/none) — файлы без этих колонок (чисто экстракционные, как сейчас) игнорируются, ничего не ломается. Встроено в `matchInquiryLines.js#matchInquiryLine`: точная (нормализованная) повторённая строка запроса → авторитетный ответ оператора, проверяется ДО живого поиска. Цена/название всегда подтягиваются живьём из ShopDB по SKU (`searchByExactSku`) — golden set никогда не источник цены, только указывает **какой** товар. Если SKU из golden set уже нет в каталоге — pipeline падает обратно в обычный поиск (не молчит как «нет совпадения»).
2. **Few-shot retrieval для LLM fallback** — `server/utils/offerKp/goldenFewShot.js`. Переиспользует эмбеддинг из 5.6: эмбеддит новую строку запроса, достаёт k (по умолчанию 3, порог сходства 0.55) наиболее похожих ПОЛОЖИТЕЛЬНЫХ примеров из golden set и вставляет их в промпт `searchAgent.pickProductsWithLlm` как «так мы раньше сопоставляли похожие случаи». Чем больше примеров в golden set, тем точнее подсказки — без тренировки чего бы то ни было.
3. Автокалибровка порогов (`SHOP_DB_EMBEDDING_WEIGHT`, `SHOP_DB_NAME_SIMILARITY_MIN` и т.д.) offline-скриптом под golden set — **не сделана**, остаётся следующим шагом, когда golden set вырастет.

**Env vars:** `SHOP_DB_GOLDEN_CORRECTIONS` (kill-switch), `SHOP_DB_FEW_SHOT_EXAMPLES`, `SHOP_DB_FEW_SHOT_MIN_SIMILARITY`. **Тесты:** `goldenCorrections.test.js`, `goldenFewShot.test.js` — полный `server/__tests__` (526 тестов) зелёный.

**Чтобы это заработало**, записи в `test_files/*.expected.csv` должны иметь заполненные `matched_sku`/`match_type` — одни `nr,source_name,unit,quantity` (текущее состояние файлов) ничему не учат.

### 6.2 Root cause: «Чтение документа...» висит очень долго

Во время тестов нашлись **незакоммиченные, но полные** изменения в рабочем дереве (не мои — WIP из более ранней сессии), которые уже бьют ровно в эту проблему. Комментарий в коде говорит прямо:

> «Swapping Qwen Thinking ↔ gpt-oss costs 90+ seconds and can unload a model from an active request.»

То есть: прежний «быстрый sequential switch eyes/brain» (последний коммит до той сессии) всё ещё стоит **90+ секунд** на каждое переключение vision-модели (OCR) ↔ agent на одном T4 16GB — и это главная причина, почему «Чтение документа...» висит. WIP меняет архитектуру на **одну резидентную модель** (`qwen/qwen3-vl-8b` для обеих ролей — OCR и chat/agent), убирая переключение совсем: `offerKpModelPipeline.js`, `offerKp.llm.defaults.js`, `offerKp.models.js`, `normalizeWorkspaceLlms.js` (новый `OFFER_KP_SINGLE_MODEL`), `docker/lmstudio-switch.sh`/`lmstudio-load-brain.sh`, `scripts/deploy-lainey-sync.sh` (дописывает профиль T4 в `.env` прода + ставит `tesseract`/`poppler-utils` при отсутствии), плюс новые этапы прогресса в UI (`vision-ocr`, `pipeline-agent-load`).

**Дополнительно найден и исправлен баг в том же WIP** (всплыл как failing test `inquiryTextQuality.test.js` → «accepts a complete structured table»): `assessInquiryTableIntegrity` в `offerKpDocumentIngest.js` проверял наличие единицы (`кг/шт/м/уп`) в `line.raw` — но `parseInquiryText` для структурных таблиц **уже выносит единицу** в отдельное поле `line.unit`, поэтому условие всегда fail'ило даже на идеально чистой таблице. Эффект: `needsReocr=true` на хорошем тексте → **лишний** вызов дорогого `enrichDocumentsWithOfferKpOcr` (vision-модель, ещё секунды/десятки секунд) на документах, которым это не нужно — вторая, независимая причина того же симптома.

Правка (`offerKpDocumentIngest.js`): вместо хрупкого regex на `raw` детектится **over-segmentation** — если `parseInquiryText` вернул заметно больше логических строк, чем число совпадений ключевых слов в сыром тексте (`parsed.length > candidateRows * 1.15`), значит один товар разъехался на несколько строк (типичный эффект плохого OCR/переносов) и **ни одной** строке не доверяем — независимо от того, выглядит ли она поодиночке полной. Проверено на обоих существующих golden-тестах целостности таблицы (чистая → `usableRows=3/3`, сломанная → `usableRows=0/3`, оба совпадают с ожиданиями тестов).

**Прод-логи (Selectel Lainey) в этой сессии не проверялись** — нет SSH в этой среде; root cause установлен статически по комментариям в WIP-коде + по failing тесту, не по live-логам. Если после деплоя проблема останется, `offerkp logs` / `journalctl -u offer-kp` на Lainey покажет, отключил ли `OFFER_KP_SINGLE_MODEL` переключение моделей на проде.

### 6.3 Что ещё открыто

- Автокалибровка порогов golden set (6.1 п. 3) — не сделана.
- Реальные данные в golden set (`matched_sku`/`match_type`) — сейчас 0 примеров с заполненными колонками; механизмы из 6.1 готовы, но неактивны, пока кто-то не добавит данные.
- Стоит добавить счётчик/лог, сколько раз реально срабатывает `enrichDocumentsWithOfferKpOcr` (до и после этой правки), чтобы подтвердить падение лишних вызовов на проде — в этой сессии не сделано.
