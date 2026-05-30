"use strict";

/**
 * generation.js — оркестратор пост-обработки и внешнего обогащения.
 *
 * Пайплайн шагов 12a–12c (мини-агент):
 *   12a. applyYandexFactCheck      — судья №1 (Yandex Cloud)
 *   12b. applyOpenRouterGarantFactCheck — судья №2 (OpenRouter + ГАРАНТ)
 *   12c. applyRussianStylePolish   — редактор стиля (Alice / OpenRouter)
 *
 * В конец каждого ответа добавляется блок «Статус API» с ✓/✗ по каждому
 * сервису, задействованному (или нет) при генерации данного ответа.
 */

const {
  runChatPostProcessWithKeepalive,
} = require("../helpers/chat/responses");
const { isPolishText } = require("../lang/detectPolish");

// ─── ENV helpers ──────────────────────────────────────────────────────────────

function envEnabled(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || String(value).trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function buildCurrentDatePreamble() {
  const tz = process.env.CHAT_SYSTEM_DATE_TZ || "Europe/Moscow";
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: tz,
  }).format(now);
  return `Текущая дата и время: ${formatted}. Часовой пояс: ${tz}.`;
}

function hasGarantToken() {
  return !!(process.env.GARANT_TOKEN || "").trim();
}

// ELI API (api.sejm.gov.pl) — publiczne, nie wymaga tokenu. Wyłączane przez
// ELI_DISABLED=1. Dla języka polskiego zastępuje ГАРАНТ jako pierwotne źródło.
function eliEnabled() {
  const v = (process.env.ELI_DISABLED || "").trim().toLowerCase();
  return !["1", "true", "yes", "on"].includes(v);
}

/**
 * Czy podany kod języka (np. z przełącznika UI / i18next) oznacza polski.
 * Akceptuje warianty typu "pl", "pl-PL", "PL".
 * @param {string|null|undefined} language
 * @returns {boolean}
 */
function isPolishLanguageCode(language) {
  if (!language || typeof language !== "string") return false;
  return /^pl(\b|[-_])/i.test(language.trim());
}

/**
 * Czy dla danej wiadomości należy użyć polskiego źródła ELI zamiast ГАРАНТ.
 *
 * Priorytet sygnałów:
 *   1. ELI_FORCE=1 → zawsze ELI.
 *   2. Jawny język z UI (i18next) — jeśli podany, decyduje (pl → ELI, inny → nie).
 *   3. Awaryjnie: automatyczne wykrycie języka polskiego z treści wiadomości.
 *
 * @param {string} message
 * @param {string|null} [language] - jawny kod języka interfejsu (np. "pl", "ru")
 * @returns {boolean}
 */
function shouldUseEli(message, language = null) {
  if (!eliEnabled()) return false;
  const force = (process.env.ELI_FORCE || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(force)) return true;

  // Jawny język interfejsu ma pierwszeństwo przed autodetekcją treści.
  if (language && typeof language === "string" && language.trim()) {
    return isPolishLanguageCode(language);
  }

  return isPolishText(message);
}

function buildLegalSourcePriorityInstructions() {
  const hasGarant = hasGarantToken();
  const hasWeb =
    !!process.env.YANDEX_SEARCH_API_KEY ||
    !!process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const hasEli = eliEnabled();
  if (!hasGarant && !hasWeb && !hasEli) return "";

  const lines = [
    "Правила приоритета источников:",
    hasEli
      ? "- Для запросов на польском языке используй акты ELI (Dziennik Ustaw / Monitor Polski, api.sejm.gov.pl) как первичный источник; в ответе на польском опирайся именно на них."
      : null,
    hasGarant
      ? "- Для запросов на русском языке при наличии релевантных материалов ГАРАНТ используй их как первичный источник."
      : null,
    hasWeb
      ? "- Веб-источники (Яндекс/Google) используй как вспомогательные."
      : null,
    hasGarant && hasWeb
      ? "- При конфликте данных следуй ГАРАНТ, а расхождение с вебом явно отмечай."
      : null,
  ].filter(Boolean);
  return lines.join("\n");
}

// ─── Optional module loader ────────────────────────────────────────────────────

async function loadOptional(modulePath, exportName) {
  try {
    const mod = require(modulePath);
    return typeof mod?.[exportName] === "function" ? mod[exportName] : null;
  } catch {
    return null;
  }
}

// ─── External enrichment ──────────────────────────────────────────────────────

function defaultEnrichTimeoutMs() {
  const garantMs = parseInt(process.env.GARANT_ENRICH_TIMEOUT_MS, 10) || 45000;
  return Math.min(120000, Math.max(8000, garantMs + 5000));
}

/**
 * Запускает обогащение из ГАРАНТ, Яндекс, Google параллельно.
 * Каждый источник завёрнут в timeout-гонку, чтобы не блокировать ответ.
 *
 * Внешние HTTP API:
 *   ГАРАНТ:  {GARANT_BASE_URL}/api/...   (token: GARANT_TOKEN)
 *   Яндекс:  https://yandex.ru/search/xml  (key: YANDEX_SEARCH_API_KEY)
 *   Google:  https://www.googleapis.com/customsearch/v1  (key: GOOGLE_CUSTOM_SEARCH_API_KEY)
 *
 * @returns {Promise<Array<{kind, contextTexts, sources, flags}>>}
 */
function hasSearxngFallback() {
  return !!(process.env.SEARXNG_FALLBACK_API_URL || "").trim();
}

async function collectExternalContexts({
  message,
  workspace,
  timeoutMs,
  language = null,
}) {
  const effectiveTimeout = timeoutMs ?? defaultEnrichTimeoutMs();

  // Wraps an enricher in a timeout race + error guard, returning a shaped result.
  const runEnrichTask = (kind, fn, fnOptions = {}) =>
    Promise.race([
      fn(message, { workspace, ...fnOptions }).then((result) => ({
        kind,
        contextTexts: result?.contextTexts || [],
        sources: result?.sources || [],
        flags: result?.flags,
      })),
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              kind,
              contextTexts: [],
              sources: [],
              flags: { [`${kind}Timeout`]: true },
            }),
          effectiveTimeout
        )
      ),
    ]).catch((err) => {
      console.warn(`[${kind}] enrich failed:`, err?.message || err);
      return { kind, contextTexts: [], sources: [] };
    });

  const tasks = [];
  const addTask = (kind, fn, fnOptions = {}) =>
    tasks.push(runEnrichTask(kind, fn, fnOptions));

  // Dla języka polskiego pierwotnym źródłem prawnym jest ELI API
  // (api.sejm.gov.pl) — zastępuje ГАРАНТ oraz rosyjsko-języczne wyszukiwarki.
  // Jawny język interfejsu (language) ma pierwszeństwo przed autodetekcją.
  const usePolishEli = shouldUseEli(message, language);

  if (usePolishEli) {
    const fn = await loadOptional("../eli/enrich", "getEliContext");
    if (fn) addTask("eli", fn, { maxDocs: 5 });
  } else {
    if (hasGarantToken()) {
      const fn = await loadOptional("../garant/enrich", "getGarantContext");
      if (fn)
        addTask("garant", fn, {
          // Top-5 documents, blended by relevance + recency (see enrich.js),
          // so answers cite the freshest of the most relevant ГАРАНТ sources.
          maxDocs: 5,
          includeSutyazhnik: true,
          sutyazhnikCount: 5,
        });
    }
    if (process.env.YANDEX_SEARCH_API_KEY) {
      const fn = await loadOptional(
        "../yandexSearch/enrich",
        "getYandexSearchContext"
      );
      if (fn) addTask("yandex", fn);
    }
    if (process.env.GOOGLE_CUSTOM_SEARCH_API_KEY) {
      const fn = await loadOptional(
        "../googleCustomSearch/enrich",
        "getGoogleSearchContext"
      );
      if (fn) addTask("google", fn);
    }
  }

  const results = tasks.length ? await Promise.all(tasks) : [];

  // ── SearXNG fallback: run ONLY when the primary legal source returned no
  // documents (ELI dla PL, w przeciwnym razie ГАРАНТ). ───────────────────────
  if (hasSearxngFallback()) {
    const primaryKind = usePolishEli ? "eli" : "garant";
    const primary = results.find((r) => r.kind === primaryKind);
    const primaryHasData = (primary?.contextTexts?.length || 0) > 0;
    if (!primaryHasData) {
      const fn = await loadOptional("../searxng/enrich", "getSearxngContext");
      if (fn) {
        console.log(
          "[SearXNG] ГАРАНТ без результатов — запускаем резервный веб-поиск."
        );
        results.push(await runEnrichTask("searxng", fn, { maxResults: 5 }));
      }
    }
  }

  return results;
}

function dedupeSources(sources = []) {
  const seen = new Set();
  const result = [];
  for (const source of sources) {
    const key =
      source?.id || source?.url || source?.title || JSON.stringify(source);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }
  return result;
}

// ─── Post-processing pipeline (мини-агент, шаги 12a-12c) ─────────────────────

/**
 * Прогоняет черновик через трёх «агентов»:
 *   12a. Судья Yandex         — фактчек по контексту
 *   12b. Судья OpenRouter     — контроль ссылок строго по ГАРАНТ
 *   12c. Редактор (Alice/OR)  — полировка стиля
 *
 * Возвращает { text, postProcessLog } где postProcessLog содержит метаданные
 * о каждом шаге (запускался / не запускался / ключ не настроен).
 *
 * @param {{ text: string, context: object }} opts
 * @returns {Promise<{ text: string, postProcessLog: object }>}
 */
async function applyPostProcessingPipeline({ text, context = {} }) {
  let output = text;

  const log = {
    yandexFactCheck: { configured: false, ran: false, changed: false },
    openRouterFactCheck: { configured: false, ran: false, changed: false },
    stylePolish: { configured: false, ran: false, changed: false },
  };

  const yandexEnabled =
    envEnabled("YANDEX_FACT_CHECK_ENABLED") &&
    !envEnabled("YANDEX_FACT_CHECK_DISABLED");
  const yandexKeyPresent = !!(
    (process.env.YANDEX_CLOUD_API_KEY || "").trim() ||
    (process.env.YANDEX_SEARCH_API_KEY || "").trim()
  );
  log.yandexFactCheck.configured = yandexEnabled && yandexKeyPresent;

  const openRouterEnabled =
    envEnabled("OPENROUTER_FACT_CHECK_ENABLED") &&
    !envEnabled("OPENROUTER_FACT_CHECK_DISABLED");
  const openRouterKeyPresent = !!(process.env.OPENROUTER_API_KEY || "").trim();
  log.openRouterFactCheck.configured =
    openRouterEnabled && openRouterKeyPresent;

  const polishDisabled = envEnabled("RUSSIAN_STYLE_POLISH_DISABLED");
  const polishYandexKey = !!(
    (process.env.YANDEX_CLOUD_API_KEY || "").trim() ||
    (process.env.YANDEX_SEARCH_API_KEY || "").trim()
  );
  const polishOrKey = !!(process.env.OPENROUTER_API_KEY || "").trim();
  log.stylePolish.configured =
    !polishDisabled && (polishYandexKey || polishOrKey);

  // ── 12a. Судья Yandex ────────────────────────────────────────────────────────
  if (log.yandexFactCheck.configured) {
    const fn = await loadOptional("./yandexFactCheck", "applyYandexFactCheck");
    if (fn) {
      const before = output;
      output = await fn(output, context?.contextTexts || []);
      log.yandexFactCheck.ran = true;
      log.yandexFactCheck.changed = output !== before;
    }
  }

  // ── 12b. Судья OpenRouter/ГАРАНТ ─────────────────────────────────────────────
  if (log.openRouterFactCheck.configured) {
    const fn = await loadOptional(
      "./openRouterGarantFactCheck",
      "applyOpenRouterGarantFactCheck"
    );
    if (fn) {
      const before = output;
      output = await fn(output, context?.contextTexts || []);
      log.openRouterFactCheck.ran = true;
      log.openRouterFactCheck.changed = output !== before;
    }
  }

  // ── 12c. Редактор стиля ──────────────────────────────────────────────────────
  if (log.stylePolish.configured) {
    const fn = await loadOptional(
      "./russianStylePolish",
      "applyRussianStylePolish"
    );
    if (fn) {
      const before = output;
      output = await fn(output);
      log.stylePolish.ran = true;
      log.stylePolish.changed = output !== before;
    }
  }

  return { text: output, postProcessLog: log };
}

// ─── Keepalive wrapper ─────────────────────────────────────────────────────────

function startKeepAlive(response, everyMs = 15_000) {
  return setInterval(() => {
    try {
      response.write(": keepalive\n\n");
    } catch {
      /* client disconnected */
    }
  }, everyMs);
}

// ─── External links ────────────────────────────────────────────────────────────

const { buildExternalLinksSection } = require("../garant/linksFooter");

function appendExternalLinksSection(text, sources = []) {
  const block = buildExternalLinksSection(sources);
  if (!block) return text || "";
  if ((text || "").includes("**Источники ГАРАНТ:**")) return text || "";
  return `${text || ""}${block}`;
}

/**
 * Когда настроенные внешние юридические источники (ГАРАНТ и/или резервный
 * SearXNG) не вернули НИ одного релевантного результата — честно сообщаем об
 * этом в ответе, вместо того чтобы подмешивать случайные «самые свежие» документы.
 *
 * @param {Array<{kind, contextTexts}>} externalContexts
 * @returns {string}
 */
function buildNoSourcesNotice(externalContexts = []) {
  const counts = {};
  for (const ctx of externalContexts)
    counts[ctx.kind] = Array.isArray(ctx?.contextTexts)
      ? ctx.contextTexts.length
      : 0;

  const usedEli = externalContexts.some((ctx) => ctx.kind === "eli");
  const searxngHas = (counts.searxng || 0) > 0;

  // ── Tryb polski (ELI) — komunikat po polsku. ────────────────────────────────
  if (usedEli) {
    const eliHas = (counts.eli || 0) > 0;
    if (eliHas || searxngHas) return "";
    return (
      "\n\n---\n⚠️ Dla Twojego zapytania nie znaleziono odpowiednich aktów w ELI API " +
      "(Dziennik Ustaw / Monitor Polski). Odpowiedź przygotowano bez oparcia o te źródła — " +
      "zalecamy doprecyzowanie zapytania lub weryfikację w źródle (eli.gov.pl / isap.sejm.gov.pl)."
    );
  }

  // ── Tryb domyślny (ГАРАНТ). ─────────────────────────────────────────────────
  const garantConfigured = hasGarantToken();
  const searxngConfigured = hasSearxngFallback();
  if (!garantConfigured && !searxngConfigured) return "";

  const garantHas = (counts.garant || 0) > 0;
  if (garantHas || searxngHas) return "";

  const where = [];
  if (garantConfigured) where.push("системе ГАРАНТ");
  if (searxngConfigured) where.push("резервном веб-поиске (SearXNG)");
  if (where.length === 0) return "";

  return (
    `\n\n---\n⚠️ По вашему запросу не найдено релевантных действующих документов в ${where.join(
      " и "
    )}. ` +
    `Ответ подготовлен без опоры на эти источники — рекомендуем уточнить формулировку запроса ` +
    `или проверить сведения в первоисточнике.`
  );
}

// ─── API status footer ────────────────────────────────────────────────────────

/**
 * Строит компактный блок «Статус API» для вставки в конец ответа.
 *
 * Показывает ✓ когда сервис был настроен И вернул данные,
 * ✗ — когда ключ не задан, сервис выключен или вернул пустой результат.
 *
 * @param {Array<{kind, contextTexts, sources}>} externalContexts
 * @param {object} postProcessLog
 * @returns {string}
 */
function buildApiStatusFooter(externalContexts = [], postProcessLog = {}) {
  const ext = {};
  for (const ctx of externalContexts) {
    ext[ctx.kind] = {
      contexts: Array.isArray(ctx.contextTexts) ? ctx.contextTexts.length : 0,
      sources: Array.isArray(ctx.sources) ? ctx.sources.length : 0,
      timedOut: !!(
        ctx.flags && Object.values(ctx.flags).some((v) => v === true)
      ),
    };
  }

  // helper: ✓ or ✗ with optional detail
  function mark(ok, label, detail = "") {
    return ok ? `✓ ${label}` : `✗ ${label}${detail ? ` (${detail})` : ""}`;
  }

  const eliOk = (ext.eli?.contexts || 0) > 0;
  const eliUsed = !!ext.eli; // task runs only in Polish mode
  const garantOk = (ext.garant?.contexts || 0) > 0;
  const yandexOk = (ext.yandex?.contexts || 0) > 0;
  const googleOk = (ext.google?.contexts || 0) > 0;
  const searxngOk = (ext.searxng?.contexts || 0) > 0;
  const searxngUsed = !!ext.searxng; // task only runs as ГАРАНТ fallback
  const garantConfigured = hasGarantToken();
  const yandexConfigured = !!(process.env.YANDEX_SEARCH_API_KEY || "").trim();
  const googleConfigured = !!(
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || ""
  ).trim();
  const searxngConfigured = !!(
    process.env.SEARXNG_FALLBACK_API_URL || ""
  ).trim();

  const items = [];

  // ── Tryb polski (ELI): pokazujemy wyłącznie status ELI. ────────────────────
  if (eliUsed) {
    items.push(
      mark(eliOk, "ELI (api.sejm.gov.pl)", eliOk ? "" : "brak danych")
    );
    if (searxngConfigured) {
      items.push(
        !searxngUsed
          ? mark(false, "SearXNG", "rezerwa niepotrzebna")
          : mark(searxngOk, "SearXNG", searxngOk ? "rezerwa" : "brak danych")
      );
    }
    return `\n\n---\n*Źródła i serwisy odpowiedzi:* ${items.join(" · ")}`;
  }

  // External enrichment
  items.push(
    garantConfigured
      ? mark(garantOk, "ГАРАНТ", garantOk ? "" : "нет данных")
      : mark(false, "ГАРАНТ", "не настроен")
  );
  items.push(
    yandexConfigured
      ? mark(yandexOk, "Яндекс.Поиск", yandexOk ? "" : "нет данных")
      : mark(false, "Яндекс.Поиск", "не настроен")
  );
  items.push(
    googleConfigured
      ? mark(googleOk, "Google", googleOk ? "" : "нет данных")
      : mark(false, "Google", "не настроен")
  );
  if (searxngConfigured) {
    // Only meaningful as a ГАРАНТ fallback; show its state only when configured.
    items.push(
      !searxngUsed
        ? mark(false, "SearXNG", "резерв не понадобился")
        : mark(searxngOk, "SearXNG", searxngOk ? "резерв" : "нет данных")
    );
  }

  // Post-processing judges
  const fc1 = postProcessLog?.yandexFactCheck;
  items.push(
    fc1?.configured
      ? mark(
          fc1.ran,
          "Фактчек Яндекс",
          fc1.ran ? (fc1.changed ? "изменил" : "без правок") : "не запустился"
        )
      : mark(false, "Фактчек Яндекс", "не настроен")
  );
  const fc2 = postProcessLog?.openRouterFactCheck;
  items.push(
    fc2?.configured
      ? mark(
          fc2.ran,
          "Фактчек ГАРАНТ/OR",
          fc2.ran ? (fc2.changed ? "изменил" : "без правок") : "не запустился"
        )
      : mark(false, "Фактчек ГАРАНТ/OR", "не настроен")
  );
  const sp = postProcessLog?.stylePolish;
  items.push(
    sp?.configured
      ? mark(
          sp.ran,
          "Полировка стиля",
          sp.ran ? (sp.changed ? "изменила" : "без правок") : "не запустилась"
        )
      : mark(false, "Полировка стиля", "не настроена")
  );

  return `\n\n---\n*Источники и сервисы ответа:* ${items.join(" · ")}`;
}

// ─── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * Полный пайплайн пост-генерации:
 *   1. Сбор внешних контекстов (если не переданы)
 *   2. Пост-обработка (судьи + редактор) с keepalive
 *   3. Блок внешних ссылок
 *   4. Блок статуса API (✓/✗)
 *
 * @param {object} opts
 * @param {import("express").Response} opts.response
 * @param {string}   opts.message
 * @param {object}   opts.workspace
 * @param {string}   opts.initialText
 * @param {string[]} opts.contextTexts
 * @param {object[]} opts.sources
 * @param {object[]|null} opts.externalContexts - если null — будет собран внутри
 * @param {object}   opts.metrics
 * @returns {Promise<{text, contextTexts, sources, metrics, externalContexts, postProcessLog}>}
 */
async function runGenerationPipeline({
  response,
  message,
  workspace,
  initialText,
  contextTexts = [],
  sources = [],
  externalContexts = null,
  metrics = {},
  language = null,
}) {
  const collectedExternalContexts = Array.isArray(externalContexts)
    ? externalContexts
    : await collectExternalContexts({ message, workspace, language });

  let mergedSources = [...sources];
  let mergedContext = [...contextTexts];
  for (const ext of collectedExternalContexts) {
    if (Array.isArray(ext?.contextTexts))
      mergedContext.push(...ext.contextTexts);
    if (Array.isArray(ext?.sources)) mergedSources.push(...ext.sources);
  }
  mergedSources = dedupeSources(mergedSources);

  // ── Шаги 12a-12c с keepalive ─────────────────────────────────────────────────
  let postProcessLog = {};
  let finalText = initialText;
  try {
    const result = await runChatPostProcessWithKeepalive(response, async () =>
      applyPostProcessingPipeline({
        text: finalText,
        context: {
          contextTexts: mergedContext,
          sources: mergedSources,
          metrics,
        },
      })
    );
    finalText = result.text;
    postProcessLog = result.postProcessLog;
  } catch (e) {
    console.warn("[runGenerationPipeline] post-processing error:", e?.message);
    // finalText stays as initialText
  }

  // ── Внешние ссылки ────────────────────────────────────────────────────────────
  finalText = appendExternalLinksSection(finalText, mergedSources);

  // ── Явное уведомление, если релевантных источников не найдено ──────────────────
  finalText += buildNoSourcesNotice(collectedExternalContexts);

  // ── API status footer ─────────────────────────────────────────────────────────
  finalText += buildApiStatusFooter(collectedExternalContexts, postProcessLog);

  return {
    text: finalText,
    contextTexts: mergedContext,
    sources: mergedSources,
    metrics,
    externalContexts: collectedExternalContexts,
    postProcessLog,
  };
}

// ─── Cost estimation ──────────────────────────────────────────────────────────

function estimateChatCost(metrics = {}, externalCosts = {}) {
  const input = Number(metrics?.prompt_tokens || 0);
  const output = Number(metrics?.completion_tokens || 0);
  const per1kInput = Number(process.env.OPENROUTER_INPUT_COST_PER_1K || 0);
  const per1kOutput = Number(process.env.OPENROUTER_OUTPUT_COST_PER_1K || 0);
  const llmCostUsd =
    (input / 1000) * per1kInput + (output / 1000) * per1kOutput;
  const externalUsd = Object.values(externalCosts).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );
  const usdTotal = llmCostUsd + externalUsd;
  const usdRub = Number(process.env.USD_RUB_RATE || 0);
  const rubTotal = usdRub > 0 ? usdTotal * usdRub : 0;
  return {
    llmUsd: Number(llmCostUsd.toFixed(6)),
    externalUsd: Number(externalUsd.toFixed(6)),
    usdTotal: Number(usdTotal.toFixed(6)),
    rubTotal: Number(rubTotal.toFixed(2)),
    usdRubRate: usdRub || null,
  };
}

module.exports = {
  appendExternalLinksSection,
  applyPostProcessingPipeline,
  buildApiStatusFooter,
  buildCurrentDatePreamble,
  buildLegalSourcePriorityInstructions,
  collectExternalContexts,
  dedupeSources,
  estimateChatCost,
  runGenerationPipeline,
  startKeepAlive,
};
