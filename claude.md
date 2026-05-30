# Перенос логики генерации ответов в другой проект

Этот документ собирает максимально полную практическую логику генерации ответа из текущего проекта (`evgeniy-llm-lawyer`) для переноса в новый проект.

## 1) Точка входа и API-поток

Основные HTTP-эндпоинты:

- `POST /workspace/:slug/stream-chat`
- `POST /workspace/:slug/thread/:threadSlug/stream-chat`

Реализация: `server/endpoints/chat.js`.

Что происходит по шагам:

1. Валидация запроса + доступа (`validatedRequest`, роли, workspace/thread middleware).
2. Проверка, что `message` не пустой.
3. Инициализация SSE-стрима:
   - `Content-Type: text/event-stream`
   - `Cache-Control: no-cache`
   - `Connection: keep-alive`
4. Ограничение по квоте в multi-user (`User.canSendChat`).
5. Вызов ядра пайплайна: `streamChatWithWorkspace(...)`.
6. Логирование telemetry/event logs.
7. `response.end()`.

Если ошибка — отправляется SSE-пакет типа `abort`.

## 2) Ядро генерации (главный оркестратор)

Главный файл: `server/utils/chats/stream.js`.

Функция: `streamChatWithWorkspace(response, workspace, message, chatMode, user, thread, attachments, options)`.

Ключевая последовательность:

1. **Slash-команды / preset-команды**
   - `grepCommand(...)` из `server/utils/chats/index.js`.
   - Built-in команда: `/reset`.
2. **Agent-режим (early-exit)**
   - `grepAgents(...)`; если активирован агентный чат, обычный поток не идет дальше.
3. **Выбор LLM + VectorDB**
   - `getLLMProvider(...)` и `getVectorDbClass()` из `server/utils/helpers/index.js`.
4. **Проверка namespace и числа эмбеддингов**
   - `VectorDb.hasNamespace`, `VectorDb.namespaceCount`.
   - Если `chatMode = query` и данных нет -> быстрый отказ (`queryRefusalResponse`).
5. **История чата**
   - `recentChatHistory(...)` из `server/utils/chats/index.js`.
6. **Pinned docs**
   - `DocumentManager(...).pinnedDocs()`.
7. **Parsed files (вложения/контекстные файлы)**
   - `WorkspaceParsedFiles.getContextFiles(...)`.
8. **Similarity search (RAG)**
   - `VectorDb.performSimilaritySearch(...)` с `similarityThreshold`, `topN`, rerank.
9. **Backfill источников из истории**
   - `fillSourceWindow(...)` из `server/utils/helpers/chat/index.js`.
10. **External enrich (в параллель)**
   - ГАРАНТ: `getGarantContext(...)`
   - Яндекс поиск: `getYandexSearchContext(...)`
   - Google CSE: `getGoogleSearchContext(...)`
11. **Сборка промпта и компрессия**
   - `chatPrompt(...)` + `LLMConnector.compressMessages(...)`.
12. **Генерация**
   - Либо `getChatCompletion` (без streaming),
   - Либо `streamGetChatCompletion` + `handleStream`.
13. **Постобработка текста**
   - `applyYandexFactCheck(...)` (по умолчанию выключено кодом),
   - `applyOpenRouterGarantFactCheck(...)` (по умолчанию выключено кодом),
   - `applyRussianStylePolish(...)` (обычно включено, если есть ключи).
14. **Подсчет стоимости/метрик**
   - LLM usage + курс USD/RUB + отдельный cost по ГАРАНТ.
15. **External links section**
   - Блок ссылок по ГАРАНТ/Яндекс/Google.
16. **Сохранение в БД**
   - `WorkspaceChats.new(...)` с `text`, `sources`, `metrics`, `ragTrace`.
17. **Финализация SSE**
   - `finalizeResponseStream`.

## 3) Формат SSE-сообщений (критично для фронта)

Запись идет через `writeResponseChunk(response, data)` (`server/utils/helpers/chat/responses.js`), формат:

- `data: <json>\n\n`

Типы событий, которые фронт должен уметь:

- `textResponseChunk` — токены/части ответа
- `abort` — ошибка
- `finalizeResponseStream` — конец стрима
- дополнительные служебные action-пакеты (например rename thread)

Есть keepalive:

- `: keepalive\n\n` во время долгой постобработки, чтобы прокси не убивал соединение.

## 4) Логика системного промпта и инструкций

Файл: `server/utils/chats/index.js`, функция `chatPrompt(workspace, user)`.

Состав системного промпта:

1. Базовый prompt:
   - `workspace.openAiPrompt` или `SystemSettings.saneDefaultSystemPrompt`.
2. Подстановка переменных:
   - `SystemPromptVariables.expandSystemPromptVariables(...)`.
3. Префикс с текущей датой и TZ:
   - `buildCurrentDatePreamble()`.
4. Условные блоки-инструкции в зависимости от env:
   - ГАРАНТ-инструкции,
   - Яндекс/Google-инструкции,
   - иерархия приоритетов источников (ГАРАНТ > веб).

Для миграции это важно сохранить практически 1-в-1, потому что именно здесь бизнес-правила юридического качества.

## 5) RAG-ядро и компрессия контекста

### 5.1 Источники контекста (в порядке приоритета)

1. External enrich префиксом:
   - ГАРАНТ, Яндекс, Google.
2. Pinned docs.
3. Parsed files.
4. Similarity search chunks.
5. Backfill из истории.

### 5.2 Компрессор сообщений

Файл: `server/utils/helpers/chat/index.js`, `messageArrayCompressor(...)`.

Принцип:

- budget: примерно `system 15%`, `history 15%`, `user 70%`.
- Если переполнение окна контекста — применяется `cannonball` (вырезка середины текста по токенам).
- История агрессивно поджимается, последние сообщения приоритетнее.

Это ключевая часть стабильной работы на разных моделях и длинах контекста.

## 6) Обогащение ГАРАНТ/Яндекс/Google

### 6.1 ГАРАНТ

Файл: `server/utils/garant/enrich.js`.

Что делает:

- Поиск по ГАРАНТ.
- Опциональный фильтр «Действующие» через topic-info.
- Вытягивание excerpt/HTML.
- Формирование `contextTexts` и `sources`.
- Таймаут и graceful fallback (не блокирует чат навсегда).

### 6.2 Яндекс и Google

- Яндекс: `server/utils/yandexSearch/enrich.js`
- Google: `server/utils/googleCustomSearch/enrich.js`

Результаты добавляются в контекст как вспомогательные веб-фрагменты.

## 7) Постпроцессинг ответа

Файлы:

- `server/utils/chats/yandexFactCheck.js`
- `server/utils/chats/openRouterGarantFactCheck.js`
- `server/utils/chats/russianStylePolish.js`

Пайплайн:

1. Yandex fact-check (в коде выключен по умолчанию, включается env).
2. OpenRouter fact-check только по ГАРАНТ (тоже выключен по умолчанию).
3. Russian style polish:
   - приоритет Yandex Cloud (Alice),
   - fallback OpenRouter.

## 8) Модель данных/хранилище истории (минимум для миграции)

Критично перенести сущности:

- `workspace_chats` (prompt, response JSON, user/thread/session ids, include)
- `workspace`
  - `chatProvider`, `chatModel`,
  - `openAiPrompt`, `openAiTemp`, `openAiHistory`,
  - `similarityThreshold`, `topN`, `chatMode`, `queryRefusalResponse`, `vectorSearchMode`.
- `workspace_threads` (если переносите thread-режим).

Модель работы с чатами: `server/models/workspaceChats.js`.

## 9) Контракт LLM-провайдеров (что должен уметь адаптер)

Минимальный интерфейс провайдера:

- `promptWindowLimit()`
- `streamingEnabled()`
- `constructPrompt(...)`
- `compressMessages(...)`
- `getChatCompletion(messages, opts)`
- `streamGetChatCompletion(messages, opts)`
- `handleStream(response, stream, props)`
- `embedTextInput`, `embedChunks`

Пример реализации: `server/utils/AiProviders/openAi/index.js`.

## 10) Переменные окружения, обязательные для переноса

Минимум для запуска:

- `LLM_PROVIDER`
- ключ/модель выбранного провайдера (например `OPEN_AI_KEY`, `OPEN_MODEL_PREF`)
- `EMBEDDING_ENGINE`
- `VECTOR_DB`

Юр-надстройки проекта:

- `GARANT_TOKEN`
- `YANDEX_SEARCH_API_KEY`
- `YANDEX_SEARCH_FOLDER_ID` / `YANDEX_FOLDER_ID`
- `GOOGLE_CUSTOM_SEARCH_API_KEY`
- `GOOGLE_CUSTOM_SEARCH_ENGINE_ID`
- `CHAT_SYSTEM_DATE_TZ`

Постпроцессинг:

- `YANDEX_CLOUD_API_KEY`
- `YANDEX_CLOUD_FOLDER`
- `YANDEX_CLOUD_MODEL`
- `RUSSIAN_STYLE_POLISH_DISABLED`
- `OPENROUTER_API_KEY`
- `RUSSIAN_STYLE_POLISH_MODEL`

Fact-check toggles:

- `YANDEX_FACT_CHECK_ENABLED`
- `YANDEX_FACT_CHECK_DISABLED`
- `OPENROUTER_FACT_CHECK_ENABLED`
- `OPENROUTER_FACT_CHECK_DISABLED`

## 11) Порядок переноса в новый проект (рекомендуемый)

1. Перенести **контракт SSE** и фронтовую обработку chunk-ов.
2. Перенести **stream-оркестратор** (`streamChatWithWorkspace`) с тем же порядком шагов.
3. Подключить 1 LLM-провайдер + 1 векторную БД (минимальный vertical slice).
4. Перенести `chatPrompt` + system variables + date preamble.
5. Перенести RAG-компрессор (`messageArrayCompressor`, `fillSourceWindow`).
6. Перенести обогащение ГАРАНТ/Яндекс/Google.
7. Перенести постпроцессинг.
8. Подключить запись в БД + ragTrace + метрики/cost.
9. После стабилизации добавить остальные провайдеры.

## 12) Что обязательно протестировать после переноса

1. Streaming не рвется на длинной генерации (keepalive работает).
2. `query`-режим корректно отказывает без контекста.
3. Источники в ответе и в БД не дублируются.
4. Внешние источники корректно встраиваются и отображаются.
5. При отключенных API enrich не ломает ответ (graceful fallback).
6. Постпроцессинг не «съедает» структуру markdown.
7. Компрессор не ломает very-long prompts.

## 13) Риски при миграции

- Потеря порядка шагов (особенно enrich до compress и postprocess после LLM).
- Несовместимость формата SSE с существующим фронтом.
- Неполный перенос `workspace`-настроек (температура, history, topN, режимы).
- Неучтенный fallback при ошибках внешних API.
- Потеря юридических guardrails внутри `chatPrompt`.

## 14) Рекомендуемый «минимальный переносимый модуль»

Если переносить частями, сначала вынесите в отдельный package/module:

- `chat-core/streamOrchestrator`
- `chat-core/promptBuilder`
- `chat-core/ragCompressor`
- `chat-core/sourceEnrichers`
- `chat-core/postProcessing`
- `chat-core/sseProtocol`

И уже в новом проекте подключайте это как единый доменный модуль, а не копируйте разрозненными файлами.

