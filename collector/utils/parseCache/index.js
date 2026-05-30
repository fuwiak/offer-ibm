"use strict";

/**
 * ParseCache — небольшой «умный» кэш результатов извлечения текста (OCR/парсинг).
 *
 * Зачем: парсинг/OCR тяжёлых PDF (например сканов актов КС-2) занимает секунды-минуты.
 * Один и тот же файл часто прогоняется повторно (парсинг в чат → затем загрузка,
 * повторная загрузка после ошибки и т.п.). Кэш позволяет не ждать OCR второй раз.
 *
 * Ленивая (chunked) оценка: чтобы быстро опознать файл, мы НЕ читаем его целиком.
 * Отпечаток считается по размеру + первым/последним 64 КБ файла. Это дёшево даже
 * для многогигабайтных файлов и при этом надёжно различает разное содержимое.
 *
 * Кэш ограничен по числу записей (LRU) и по времени жизни (TTL), целиком in-memory —
 * никаких файлов на диске, сбрасывается при перезапуске коллектора.
 */

const fs = require("fs");
const crypto = require("crypto");

const MAX_ENTRIES = Number(process.env.PARSE_CACHE_MAX_ENTRIES || 50);
const TTL_MS = Number(process.env.PARSE_CACHE_TTL_MS || 30 * 60 * 1000); // 30 минут
const SAMPLE_BYTES = 64 * 1024; // по 64 КБ с начала и с конца файла
const ENABLED = process.env.PARSE_CACHE_DISABLED !== "true";

/** @type {Map<string, { value: any, expiresAt: number }>} вставка в конце = «свежий» (LRU). */
const store = new Map();

function log(text, ...args) {
  console.log(`\x1b[36m[ParseCache]\x1b[0m ${text}`, ...args);
}

/**
 * Дешёвый отпечаток файла без полного чтения: размер + head + tail.
 * @param {string} fullFilePath
 * @returns {string|null} hex-хэш или null, если файл недоступен.
 */
function fileFingerprint(fullFilePath) {
  try {
    const { size } = fs.statSync(fullFilePath);
    const hash = crypto.createHash("sha1");
    hash.update(`size:${size}`);

    const fd = fs.openSync(fullFilePath, "r");
    try {
      const headLen = Math.min(SAMPLE_BYTES, size);
      if (headLen > 0) {
        const head = Buffer.alloc(headLen);
        fs.readSync(fd, head, 0, headLen, 0);
        hash.update(head);
      }
      // Хвост читаем только если файл заметно больше одной выборки,
      // иначе head уже покрыл весь файл.
      if (size > SAMPLE_BYTES * 2) {
        const tail = Buffer.alloc(SAMPLE_BYTES);
        fs.readSync(fd, tail, 0, SAMPLE_BYTES, size - SAMPLE_BYTES);
        hash.update(tail);
      }
    } finally {
      fs.closeSync(fd);
    }
    return hash.digest("hex");
  } catch (e) {
    log(`fingerprint failed for ${fullFilePath}: ${e.message}`);
    return null;
  }
}

/**
 * Строит ключ кэша из отпечатка файла и дополнительных частей
 * (например тип обработки и список языков OCR).
 * @param {string} fullFilePath
 * @param {Array<string|number|boolean>} [extraKeyParts]
 * @returns {string|null}
 */
function buildKey(fullFilePath, extraKeyParts = []) {
  const fp = fileFingerprint(fullFilePath);
  if (!fp) return null;
  return [fp, ...extraKeyParts.map((p) => String(p))].join("::");
}

function isExpired(entry) {
  return !entry || entry.expiresAt <= Date.now();
}

/**
 * Возвращает закэшированное значение или null. Обновляет LRU-порядок.
 * @param {string|null} key
 */
function get(key) {
  if (!ENABLED || !key) return null;
  const entry = store.get(key);
  if (!entry) return null;
  if (isExpired(entry)) {
    store.delete(key);
    return null;
  }
  // refresh LRU-позицию
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

/**
 * Сохраняет значение в кэш с вытеснением старейшей записи при переполнении.
 * @param {string|null} key
 * @param {any} value
 */
function set(key, value) {
  if (!ENABLED || !key || value === undefined || value === null) return;
  if (store.has(key)) store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

/**
 * Ленивое получение: при промахе вычисляет значение через producer и кэширует его.
 * @template T
 * @param {string|null} key
 * @param {() => Promise<T>} producer
 * @returns {Promise<T>}
 */
async function remember(key, producer) {
  const cached = get(key);
  if (cached !== null) {
    log("cache HIT — пропускаем повторное извлечение текста.");
    return cached;
  }
  const value = await producer();
  set(key, value);
  return value;
}

function clear() {
  store.clear();
}

module.exports = {
  fileFingerprint,
  buildKey,
  get,
  set,
  remember,
  clear,
};
