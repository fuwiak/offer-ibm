const crypto = require("crypto");

const EXTERNAL_DOC_SOURCES = new Set([
  "ГАРАНТ",
  "Яндекс",
  "Google",
  "Google (изображения)",
]);

/**
 * Снимок RAG для legal eval: порядок topic ГАРАНТ, смесь источников, флаги.
 * @param {{
 *   sources?: object[],
 *   chatMode?: string,
 *   workspaceId?: number|null,
 *   prompt?: string,
 *   garantFlags?: Record<string, unknown>,
 *   webSearchEnrichEnabled?: boolean,
 * }} params
 * @returns {object}
 */
function buildRagTrace({
  sources = [],
  chatMode = "chat",
  workspaceId = null,
  prompt = "",
  garantFlags = {},
  webSearchEnrichEnabled = true,
} = {}) {
  const arr = Array.isArray(sources) ? sources : [];
  const garantTopicsOrdered = [];
  for (const s of arr) {
    if (s && s.docSource === "ГАРАНТ" && s.garantTopic != null) {
      garantTopicsOrdered.push(String(s.garantTopic));
    }
  }

  const vectorDocIds = arr
    .filter((s) => s && !EXTERNAL_DOC_SOURCES.has(s.docSource))
    .map((s) =>
      s.id != null ? String(s.id) : String(s.chunkSource || "").trim()
    )
    .filter(Boolean);

  const countBy = (pred) => arr.filter(pred).length;
  const sourceMix = {
    garant: countBy((s) => s && s.docSource === "ГАРАНТ"),
    yandex: countBy((s) => s && s.docSource === "Яндекс"),
    google: countBy(
      (s) =>
        s &&
        (s.docSource === "Google" ||
          s.docSource === "Google (изображения)")
    ),
    workspace: countBy((s) => s && !EXTERNAL_DOC_SOURCES.has(s.docSource)),
  };

  const shown = arr.filter(
    (s) => s && EXTERNAL_DOC_SOURCES.has(s.docSource)
  );
  const shownMix = {
    garant: shown.filter((s) => s.docSource === "ГАРАНТ").length,
    yandex: shown.filter((s) => s.docSource === "Яндекс").length,
    google: shown.filter((s) =>
      ["Google", "Google (изображения)"].includes(s.docSource)
    ).length,
  };
  const onlyWebInShown =
    shown.length > 0 &&
    shownMix.garant === 0 &&
    (shownMix.yandex > 0 || shownMix.google > 0);

  const promptHash =
    prompt && typeof prompt === "string"
      ? crypto
          .createHash("sha256")
          .update(prompt, "utf8")
          .digest("hex")
          .slice(0, 16)
      : null;

  return {
    version: 1,
    at: new Date().toISOString(),
    chatMode,
    workspaceId: workspaceId != null ? Number(workspaceId) : null,
    promptHash,
    garantTopicsOrdered,
    vectorDocIds: vectorDocIds.slice(0, 80),
    sourceMix,
    shownSourceMix: shownMix,
    flags: {
      garantEmpty: sourceMix.garant === 0,
      onlyWebInShown,
      webSearchEnrichEnabled,
      ...garantFlags,
    },
  };
}

/** @param {object} garantResult */
function garantFlagsFromEnrichResult(garantResult, hadToken) {
  if (!hadToken) return { garantTokenMissing: true };
  const f = garantResult?.flags;
  if (f && typeof f === "object") return f;
  return {};
}

module.exports = {
  buildRagTrace,
  EXTERNAL_DOC_SOURCES,
  garantFlagsFromEnrichResult,
};
