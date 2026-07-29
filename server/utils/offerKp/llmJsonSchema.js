"use strict";

/**
 * Runtime validation for LLM JSON outputs (Joi — already a server dependency).
 * Structural hallucinations (invented keys / non-array / non-numeric ids)
 * die here instead of silently propagating.
 *
 * Also exports OpenAI-compatible response_format json_schema payloads for
 * constrained decoding on LM Studio (when the adapter forwards them).
 */

const Joi = require("joi");

const productIdArraySchema = Joi.array()
  .items(
    Joi.alternatives().try(
      Joi.number().integer().positive(),
      Joi.string().pattern(/^\d+$/)
    )
  )
  .max(20);

/** OCR vision may return objects, strings, or compact [name, qty, unit] rows. */
const ocrLineSchema = Joi.alternatives().try(
  Joi.string().min(1),
  Joi.array().min(1),
  Joi.object({
    name: Joi.string().allow("").optional(),
    qty: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
    quantity: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
    unit: Joi.string().allow("").optional(),
    din: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null).optional(),
    gost: Joi.alternatives().try(Joi.string(), Joi.number()).allow(null).optional(),
    notes: Joi.string().allow("", null).optional(),
    source_page: Joi.number().integer().optional(),
    source_row: Joi.number().integer().optional(),
    name_verbatim: Joi.string().allow("").optional(),
    confidence: Joi.number().min(0).max(1).optional(),
  }).unknown(true)
);

const ocrLinesArraySchema = Joi.array().items(ocrLineSchema).max(500);

const INTENT_CATEGORY_ENUM = [
  "product_inquiry",
  "product_search",
  "create_quote",
  "edit_quote",
  "document_question",
  "data_question",
  "system_help",
  "casual_or_test",
  "out_of_scope",
];

/** Constrained-decoding schemas for LM Studio / OpenAI-compatible APIs. */
const RESPONSE_FORMATS = Object.freeze({
  productSelection: {
    type: "json_schema",
    json_schema: {
      name: "product_selection",
      strict: true,
      schema: {
        type: "object",
        properties: {
          product_ids: {
            type: "array",
            items: { type: "integer" },
          },
        },
        required: ["product_ids"],
        additionalProperties: false,
      },
    },
  },
  intentCategory: {
    type: "json_schema",
    json_schema: {
      name: "intent_category",
      strict: true,
      schema: {
        type: "object",
        properties: {
          category: { type: "string", enum: INTENT_CATEGORY_ENUM },
        },
        required: ["category"],
        additionalProperties: false,
      },
    },
  },
  quoteIntent: {
    type: "json_schema",
    json_schema: {
      name: "quote_intent",
      strict: true,
      schema: {
        type: "object",
        properties: {
          approved: { type: "boolean" },
        },
        required: ["approved"],
        additionalProperties: false,
      },
    },
  },
  askSql: {
    type: "json_schema",
    json_schema: {
      name: "ask_sql",
      strict: true,
      schema: {
        type: "object",
        properties: {
          sql: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["sql", "rationale"],
        additionalProperties: false,
      },
    },
  },
  ocrLines: {
    type: "json_schema",
    json_schema: {
      name: "ocr_lines",
      strict: true,
      schema: {
        type: "object",
        properties: {
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source_page: { type: "integer" },
                source_row: { type: "integer" },
                name_verbatim: { type: "string" },
                quantity: { type: ["number", "null"] },
                unit: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["name_verbatim"],
              additionalProperties: false,
            },
          },
        },
        required: ["lines"],
        additionalProperties: false,
      },
    },
  },
});

/**
 * @param {unknown} value
 * @returns {number[]} positive integer product ids (deduped, order preserved)
 */
function parseProductIdArray(value) {
  if (!Array.isArray(value)) return [];
  const ids = [];
  const seen = new Set();
  for (const v of value) {
    const { error, value: item } = Joi.alternatives()
      .try(
        Joi.number().integer().positive(),
        Joi.string().pattern(/^\d+$/)
      )
      .validate(v, { convert: true });
    if (error) continue;
    const id = typeof item === "number" ? item : parseInt(String(item), 10);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  // Cap after filtering so a huge hallucinated list cannot explode downstream.
  return ids.slice(0, 20);
}

/**
 * Accept plain id arrays or `{ product_ids: [...] }` from constrained decoding.
 * @param {unknown} value
 * @returns {number[]}
 */
function parseProductSelectionPayload(value) {
  if (Array.isArray(value)) return parseProductIdArray(value);
  if (value && typeof value === "object" && Array.isArray(value.product_ids)) {
    return parseProductIdArray(value.product_ids);
  }
  return [];
}

/**
 * @param {unknown} value
 * @returns {Array|null} validated OCR lines or null
 */
function parseOcrLinesArray(value) {
  const { error, value: validated } = ocrLinesArraySchema.validate(value, {
    abortEarly: false,
    convert: true,
  });
  if (error || !Array.isArray(validated)) return null;
  return validated;
}

/**
 * Parse OCR constrained object `{ lines: [...] }` or legacy bare array.
 * @param {unknown} value
 * @returns {Array|null}
 */
function parseOcrLinesPayload(value) {
  if (Array.isArray(value)) return parseOcrLinesArray(value);
  if (value && typeof value === "object" && Array.isArray(value.lines)) {
    return parseOcrLinesArray(value.lines);
  }
  return null;
}

module.exports = {
  productIdArraySchema,
  ocrLinesArraySchema,
  INTENT_CATEGORY_ENUM,
  RESPONSE_FORMATS,
  parseProductIdArray,
  parseProductSelectionPayload,
  parseOcrLinesArray,
  parseOcrLinesPayload,
};
