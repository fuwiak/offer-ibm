/**
 * Генерация ответа LLM по данным ShopDB (natural-language → SQL → ответ).
 *
 * Поток:
 *   1. Собираем компактное описание схемы (таблицы + колонки).
 *   2. LLM по вопросу пользователя пишет один безопасный SELECT.
 *   3. Запрос валидируется и выполняется read-only через explorer.
 *   4. LLM формулирует ответ на естественном языке по строкам результата.
 *
 * Все мутации блокируются валидатором explorer (validateReadOnlyQuery),
 * поэтому даже при «галлюцинации» модели БД остаётся защищённой.
 */

const { getLLMProviderWithFallback } = require("../../helpers");
const shopDbLog = require("../shopDbLog");
const {
  listTables,
  describeTable,
  runReadQuery,
  dbStatus,
} = require("./explorer");
const { TABLES } = require("./schema");

// Сколько таблиц максимум описываем в промпте схемы.
const MAX_SCHEMA_TABLES = 14;
// Сколько строк результата отдаём LLM для формулировки ответа.
const MAX_ANSWER_ROWS = 40;
// Дефолтный LIMIT для сгенерированного SELECT.
const DEFAULT_QUERY_LIMIT = 50;

// Таблицы каталога purolat имеют приоритет в описании схемы.
const PRIORITY_TABLES = Object.values(TABLES);

function priorityIndex(name) {
  const i = PRIORITY_TABLES.indexOf(name);
  return i === -1 ? PRIORITY_TABLES.length + 1 : i;
}

/**
 * Компактное текстовое описание схемы для системного промпта.
 * @returns {Promise<{ text: string, tables: string[] }>}
 */
async function buildSchemaSummary() {
  const tables = await listTables();
  const ordered = [...tables].sort((a, b) => {
    const pa = priorityIndex(a.name);
    const pb = priorityIndex(b.name);
    if (pa !== pb) return pa - pb;
    return b.approxRows - a.approxRows;
  });

  const selected = ordered.slice(0, MAX_SCHEMA_TABLES);
  const blocks = [];
  for (const t of selected) {
    try {
      const columns = await describeTable(t.name);
      const cols = columns
        .map((c) => {
          const tags = [c.key === "PRI" ? "PK" : null].filter(Boolean);
          return `${c.name} ${c.type}${tags.length ? ` [${tags.join(",")}]` : ""}`;
        })
        .join(", ");
      blocks.push(`Таблица \`${t.name}\` (~${t.approxRows} строк): ${cols}`);
    } catch (e) {
      shopDbLog.warn("ask: describeTable failed", {
        table: t.name,
        error: e?.message || String(e),
      });
    }
  }

  return { text: blocks.join("\n"), tables: selected.map((t) => t.name) };
}

const SQL_SYSTEM_PROMPT = `Ты SQL-аналитик каталога purolat.com (MySQL, Webasyst Shop-Script).
По вопросу пользователя составь ОДИН безопасный SELECT-запрос к базе.

Жёсткие правила:
- Только SELECT (или WITH ... SELECT). Никаких INSERT/UPDATE/DELETE/DDL.
- Один запрос, без точки с запятой в конце.
- Используй только перечисленные таблицы и колонки.
- Активные товары: shop_product.status = 1.
- Всегда добавляй разумный LIMIT (не больше ${DEFAULT_QUERY_LIMIT}).
- Если данных для ответа в схеме нет — верни пустую строку в поле sql.

Ответ строго в JSON без markdown:
{"sql": "SELECT ...", "rationale": "кратко зачем этот запрос"}`;

function extractJsonObject(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Просит LLM написать SELECT по вопросу пользователя. */
async function generateSql(LLMConnector, schemaText, question) {
  const messages = [
    { role: "system", content: SQL_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Схема базы:\n${schemaText}\n\nВопрос: ${question}`,
    },
  ];
  const { textResponse } = await LLMConnector.getChatCompletion(messages, {
    temperature: 0,
  });
  const parsed = extractJsonObject(textResponse);
  if (parsed && typeof parsed.sql === "string") {
    return { sql: parsed.sql.trim(), rationale: parsed.rationale || null };
  }
  // На случай, если модель вернула голый SQL без JSON.
  const naked = String(textResponse || "").trim();
  if (/^(select|with)\b/i.test(naked)) {
    return { sql: naked.replace(/;\s*$/, ""), rationale: null };
  }
  return { sql: "", rationale: null };
}

const ANSWER_SYSTEM_PROMPT = `Ты ассистент по каталогу purolat.com.
По строкам результата SQL-запроса дай краткий, точный ответ на вопрос пользователя на русском языке.
Опирайся только на данные из результата. Если результат пуст — честно скажи, что данных не найдено.
Не выдумывай цены, артикулы и ссылки, которых нет в данных.`;

/** Просит LLM сформулировать ответ по строкам результата. */
async function generateAnswer(LLMConnector, question, sql, result) {
  const rows = result.rows.slice(0, MAX_ANSWER_ROWS);
  const dataBlock = JSON.stringify({ columns: result.columns, rows }, null, 0);
  const messages = [
    { role: "system", content: ANSWER_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Вопрос: ${question}\n\n` +
        `Выполненный SQL: ${sql}\n\n` +
        `Результат (${result.rowCount} строк${
          result.truncated ? ", усечён" : ""
        }):\n${dataBlock}`,
    },
  ];
  const { textResponse } = await LLMConnector.getChatCompletion(messages, {
    temperature: 0.2,
  });
  return String(textResponse || "").trim();
}

/**
 * Главная точка входа: вопрос на естественном языке → ответ LLM по данным БД.
 *
 * @param {object} args
 * @param {string} args.question  Вопрос пользователя.
 * @param {object} [args.workspace] Workspace для выбора провайдера/модели.
 * @param {number} [args.limit]   Переопределение LIMIT для запроса.
 * @returns {Promise<{ question: string, sql: string|null, rationale: string|null,
 *   result: { columns: string[], rows: object[], rowCount: number, truncated: boolean }|null,
 *   answer: string, error?: string }>}
 */
async function askShopDb({ question, workspace = null, limit } = {}) {
  const q = String(question || "").trim();
  if (!q) {
    const err = new Error("EMPTY_QUESTION");
    err.code = "EMPTY_QUESTION";
    throw err;
  }

  const status = dbStatus();
  if (!status.configured) {
    const err = new Error("SHOP_DB_NOT_CONFIGURED");
    err.code = "SHOP_DB_NOT_CONFIGURED";
    throw err;
  }

  const t0 = Date.now();
  const LLMConnector = await getLLMProviderWithFallback({
    provider: workspace?.chatProvider || null,
    model: workspace?.chatModel || null,
  });

  const { text: schemaText } = await buildSchemaSummary();
  const { sql, rationale } = await generateSql(LLMConnector, schemaText, q);

  if (!sql) {
    shopDbLog.info("ask: no SQL produced", { question: q });
    return {
      question: q,
      sql: null,
      rationale,
      result: null,
      answer:
        "Не удалось подобрать запрос к базе для этого вопроса. Уточните, что именно нужно найти в каталоге.",
      ms: Date.now() - t0,
    };
  }

  let result;
  try {
    result = await runReadQuery(sql, {
      limit: Number.isFinite(limit) ? limit : DEFAULT_QUERY_LIMIT,
    });
  } catch (e) {
    shopDbLog.warn("ask: query rejected/failed", {
      question: q,
      sql,
      error: e?.message || String(e),
      code: e?.code,
    });
    return {
      question: q,
      sql,
      rationale,
      result: null,
      answer:
        "Сгенерированный запрос не удалось безопасно выполнить. Переформулируйте вопрос.",
      error: e?.message || String(e),
      ms: Date.now() - t0,
    };
  }

  const answer = await generateAnswer(LLMConnector, q, result.sql, result);

  shopDbLog.ok("ask: answered", {
    question: q,
    rowCount: result.rowCount,
    ms: Date.now() - t0,
  });

  return {
    question: q,
    sql: result.sql,
    rationale,
    result: {
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      truncated: result.truncated,
    },
    answer,
    ms: Date.now() - t0,
  };
}

module.exports = {
  askShopDb,
  buildSchemaSummary,
};
