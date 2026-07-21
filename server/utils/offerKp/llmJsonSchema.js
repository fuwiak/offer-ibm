"use strict";

/**
 * Runtime validation for LLM JSON outputs (Joi — already a server dependency).
 * Structural hallucinations (invented keys / non-array / non-numeric ids)
 * die here instead of silently propagating.
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
  }).unknown(true)
);

const ocrLinesArraySchema = Joi.array().items(ocrLineSchema).max(500);

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

module.exports = {
  productIdArraySchema,
  ocrLinesArraySchema,
  parseProductIdArray,
  parseOcrLinesArray,
};
