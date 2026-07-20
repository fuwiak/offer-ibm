"use strict";

/**
 * MD-skill/knowledge harness для поиска — явные, написанные человеком
 * доменные правила (не примеры, не embeddings), подмешиваемые в промпт
 * ТОЛЬКО когда уже существующий сигнал (DIN/ГОСТ в запросе, аналоговый
 * интент и т.п.) показывает, что они релевантны. Progressive disclosure
 * как у Claude Agent Skills — см. AUDYT.md §7: дешёвый индекс всегда в
 * памяти, полный текст файла подмешивается только по совпадению триггера,
 * а не в каждый промпт.
 *
 * Файлы лежат в server/utils/offerKp/knowledge/*.md с YAML frontmatter
 * (name, description, triggers — список через запятую). Формат редактирует
 * человек (каталог-менеджер), без необходимости трогать код/CSV.
 */

const fs = require("fs");
const path = require("path");

const KNOWLEDGE_DIR = path.resolve(__dirname, "knowledge");

function envFlagEnabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(
    String(raw).trim().toLowerCase()
  );
}

const KNOWLEDGE_ENABLED = envFlagEnabled("SHOP_DB_KNOWLEDGE_BASE", true);

function parseFrontmatter(raw) {
  const match = String(raw || "").match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
  );
  if (!match) return { meta: {}, body: String(raw || "").trim() };

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: match[2].trim() };
}

function loadKnowledgeEntries() {
  if (!KNOWLEDGE_ENABLED) return [];

  let files;
  try {
    files = fs
      .readdirSync(KNOWLEDGE_DIR)
      .filter((f) => f.toLowerCase().endsWith(".md"));
  } catch (error) {
    console.error(
      "[KnowledgeBase] Failed to list knowledge dir, disabling:",
      error?.message || error
    );
    return [];
  }

  return files
    .map((file) => {
      try {
        const raw = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf8");
        const { meta, body } = parseFrontmatter(raw);
        const triggers = String(meta.triggers || "")
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        if (!body || !triggers.length) return null;
        return {
          file,
          name: meta.name || file,
          description: meta.description || "",
          triggers,
          body,
        };
      } catch (error) {
        console.error(
          `[KnowledgeBase] Failed to parse ${file}, skipping:`,
          error?.message || error
        );
        return null;
      }
    })
    .filter(Boolean);
}

/** @type {Array<object>|null} */
let entries = null;

function getEntries() {
  if (!entries) entries = loadKnowledgeEntries();
  return entries;
}

/** Ops/testing hook — force a re-read of knowledge/*.md. */
function reloadKnowledgeBase() {
  entries = loadKnowledgeEntries();
  return entries;
}

/**
 * @param {{ hasStandardNumber?: boolean, analogIntent?: boolean }} signals
 * @returns {Array<{name: string, body: string}>}
 */
function selectRelevantKnowledge(signals = {}) {
  const active = new Set();
  if (signals.hasStandardNumber) {
    active.add("din");
    active.add("gost");
    active.add("standard");
  }
  if (signals.analogIntent) active.add("analog");
  if (!active.size) return [];

  return getEntries().filter((entry) =>
    entry.triggers.some((t) => active.has(t))
  );
}

function formatKnowledgeBlock(matched = []) {
  if (!matched.length) return "";
  return [
    "Справочные правила по теме запроса (не примеры — общие факты о стандартах):",
    ...matched.map((e) => `### ${e.name}\n${e.body}`),
  ].join("\n\n");
}

module.exports = {
  selectRelevantKnowledge,
  formatKnowledgeBlock,
  reloadKnowledgeBase,
  isKnowledgeBaseEnabled: () => KNOWLEDGE_ENABLED,
};
