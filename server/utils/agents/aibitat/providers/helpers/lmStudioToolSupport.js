/**
 * LM Studio native OpenAI tools are unsafe for some chat templates.
 * Qwen3-VL (and similar vision packs) often advertise tool training but crash
 * Jinja rendering with tools[] ("Cannot call something that is not a function").
 */

function isLmStudioJinjaToolTemplateError(error) {
  const msg = [
    error?.message,
    error?.error?.message,
    error?.cause?.message,
    typeof error === "string" ? error : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    /jinja/i.test(msg) ||
    /prompt template/i.test(msg) ||
    /Cannot call something that is not a function/i.test(msg) ||
    /ObjectValue|UndefinedValue/i.test(msg)
  );
}

/**
 * Models that must use UnTooled (prompt tools), never native tools[].
 * @param {string} modelId
 * @returns {boolean}
 */
function lmStudioModelAllowsNativeTools(modelId) {
  const id = String(modelId || "")
    .trim()
    .toLowerCase();
  if (!id) return false;
  // Vision / multimodal GGUFs with broken or incomplete tool Jinja in LM Studio.
  if (/(^|\/)qwen[\w.-]*-?vl\b/.test(id) || id.includes("/qwen3-vl"))
    return false;
  if (id.includes("paddleocr") || id.includes("vision")) return false;
  if (id.includes("-vl-") || id.endsWith("-vl") || id.includes(".vl."))
    return false;
  return true;
}

module.exports = {
  isLmStudioJinjaToolTemplateError,
  lmStudioModelAllowsNativeTools,
};
