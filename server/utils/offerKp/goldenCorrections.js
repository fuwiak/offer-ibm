"use strict";

/**
 * "Tabela korekt" — golden-set (test_files/*.expected.csv) jako autorytatywne
 * poprawki matchingu. To NIE jest fine-tuning: to jawny lookup (znormalizowana
 * treść linii zapytania -> SKU/typ dopasowania), wczytany raz z plików golden
 * setu i sprawdzany przed żywym wyszukiwaniem w ShopDB.
 *
 * Rozszerza istniejący schemat CSV (nr,source_name,unit,quantity) o
 * OPCJONALNE kolumny: matched_sku,matched_name,match_type. Pliki bez tych
 * kolumn (czysto ekstrakcyjne, jak dziś) są po prostu pomijane przez ten
 * moduł — nic z test_files/README.md / goldenSet.test.js się nie zmienia.
 *
 * Użycie: dopisz do wiersza w *.expected.csv wartości
 *   matched_sku,matched_name,match_type   (match_type: exact|analog|none)
 * — od następnego uruchomienia procesu ten dokładny wiersz zapytania będzie
 * rozwiązywany z tego źródła zamiast heurystyk TF-IDF/LLM.
 */

const fs = require("fs");
const path = require("path");
const { normalizeSearchText, foldHomoglyphs } = require("./textNormalize");

const TEST_FILES_DIR = path.resolve(__dirname, "../../../../test_files");
const VALID_MATCH_TYPES = new Set(["exact", "analog", "none"]);

function envFlagEnabled(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  return !["0", "false", "no", "off"].includes(
    String(raw).trim().toLowerCase()
  );
}

const CORRECTIONS_ENABLED = envFlagEnabled("SHOP_DB_GOLDEN_CORRECTIONS", true);

function normalizeKey(text) {
  return normalizeSearchText(foldHomoglyphs(String(text || "")));
}

/** Minimal CSV parser: quoted fields may contain commas (mirrors goldenSet.test.js). */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function findExpectedCsvFiles(dir) {
  const found = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findExpectedCsvFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".expected.csv")) {
      found.push(full);
    }
  }
  return found;
}

function parseExpectedCsv(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);

  const sourceNameIdx = idx("source_name");
  const skuIdx = idx("matched_sku");
  const nameIdx = idx("matched_name");
  const typeIdx = idx("match_type");
  // Extraction-only file (current default schema) — nothing to learn from here.
  if (sourceNameIdx < 0 || skuIdx < 0) return [];

  return lines
    .slice(1)
    .map((line) => {
      const fields = parseCsvLine(line);
      const sourceName = (fields[sourceNameIdx] || "").trim();
      const sku = (fields[skuIdx] || "").trim();
      const matchedName = nameIdx >= 0 ? (fields[nameIdx] || "").trim() : "";
      const rawMatchType =
        typeIdx >= 0 ? (fields[typeIdx] || "").trim().toLowerCase() : "";
      if (!sourceName) return null;
      if (!sku && rawMatchType !== "none") return null;
      if (rawMatchType && !VALID_MATCH_TYPES.has(rawMatchType)) return null;
      return {
        sourceName,
        sku: sku || null,
        matchedName: matchedName || null,
        matchType: rawMatchType || (sku ? "exact" : "none"),
        sourceFile: path.relative(TEST_FILES_DIR, csvPath),
      };
    })
    .filter(Boolean);
}

/** @type {Map<string, object>|null} */
let index = null;

function loadGoldenCorrections() {
  const map = new Map();
  if (!CORRECTIONS_ENABLED) return map;
  for (const csvPath of findExpectedCsvFiles(TEST_FILES_DIR)) {
    let rows;
    try {
      rows = parseExpectedCsv(csvPath);
    } catch (error) {
      console.error(
        `[GoldenCorrections] Failed to parse ${csvPath}:`,
        error?.message || error
      );
      continue;
    }
    for (const row of rows) {
      map.set(normalizeKey(row.sourceName), row);
    }
  }
  return map;
}

function getIndex() {
  if (!index) index = loadGoldenCorrections();
  return index;
}

/** Ops/testing hook — force a re-read of test_files/*.expected.csv. */
function reloadGoldenCorrections() {
  index = loadGoldenCorrections();
  return index;
}

/**
 * @param {string[]} candidateTexts - raw line text(s) to try, in priority order
 * @returns {{sourceName:string, sku:string|null, matchedName:string|null, matchType:string, sourceFile:string}|null}
 */
function findGoldenCorrection(candidateTexts = []) {
  const map = getIndex();
  if (!map.size) return null;
  for (const text of candidateTexts) {
    if (!text) continue;
    const hit = map.get(normalizeKey(text));
    if (hit) return hit;
  }
  return null;
}

/** All positive (exact/analog) corrections — source data for few-shot examples. */
function listMatchExamples() {
  return [...getIndex().values()].filter(
    (row) => row.matchType !== "none" && row.sku
  );
}

module.exports = {
  findGoldenCorrection,
  listMatchExamples,
  reloadGoldenCorrections,
  isGoldenCorrectionsEnabled: () => CORRECTIONS_ENABLED,
  // Exported for unit tests only — pure parsing, no filesystem discovery.
  parseExpectedCsv,
};
