"use strict";

const crypto = require("crypto");
const {
  pipelineVersion,
  ocrPromptVersion,
  visionModelId,
} = require("./constants");

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

/**
 * Deterministic OCR/pipeline job id — same file + versions → same job (dedup).
 * jobId = sha256(fileHash + pipelineVersion + modelId + ocrPromptVersion)
 */
function buildOfferKpJobId({
  fileHash,
  pipelineVersion: pv = pipelineVersion(),
  modelId = visionModelId(),
  ocrPromptVersion: opv = ocrPromptVersion(),
} = {}) {
  const hash = String(fileHash || "")
    .trim()
    .toLowerCase();
  if (!hash) throw new Error("fileHash is required for OfferKP job id");
  return sha256Hex(`${hash}|${pv}|${modelId}|${opv}`);
}

function fileHashFromBuffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function fileHashFromPath(fs, filePath) {
  const data = fs.readFileSync(filePath);
  return fileHashFromBuffer(data);
}

function retrievalCacheKey({
  queryHash,
  indexVersion,
  limit,
} = {}) {
  return sha256Hex(
    `retrieval|${queryHash || ""}|${indexVersion || ""}|${limit || 0}`
  );
}

module.exports = {
  sha256Hex,
  buildOfferKpJobId,
  fileHashFromBuffer,
  fileHashFromPath,
  retrievalCacheKey,
};
