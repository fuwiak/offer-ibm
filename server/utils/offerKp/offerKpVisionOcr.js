const llmDefaults = require("../../config/offerKp.llm.defaults");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const {
  resolveOpenRouterApiKey,
  resolveOpenRouterBaseUrl,
  resolveOpenRouterHeaders,
} = require("../offerKpApp/openRouterEnv");
const {
  shouldUseTeacherLlm,
  resolveTeacherModel,
} = require("../offerKpApp/teacherLlm");
const { renderPdfPages } = require("./offerKpPaddleOcr");
const {
  resolvePipelineVisionModel,
  ensurePipelineModelLoaded,
} = require("./offerKpModelPipeline");
const {
  OFFER_KP_DETERMINISTIC_SAMPLING,
} = require("./deterministicSampling");
const {
  RESPONSE_FORMATS,
  parseOcrLinesPayload,
} = require("./llmJsonSchema");

/** Legacy plain-text OCR (fallback when JSON parse fails). */
const VISION_OCR_PROMPT = `Извлеки весь текст с изображения заявки/спецификации.
Сохрани таблицу построчно: № | Наименование | Ед.изм. | Кол-во.
Кол-во — целые числа или кг из колонки «Кол-во». НЕ путай кол-во с ценой (руб/копейки).
Только извлечённый текст на русском, без комментариев.`;

/**
 * Eyes only: extract line items as JSON. Never invent prices or SKUs —
 * catalog truth lives in ShopDB / matchInquiry.
 */
const VISION_OCR_JSON_PROMPT = `Ты — OCR глаз для заявки на крепёж. Извлеки ВСЕ позиции с изображения.

Верни ТОЛЬКО JSON-объект (без markdown и рассуждений):
{"lines":[{"source_page":1,"source_row":1,"name_verbatim":"полное наименование","quantity":100,"unit":"шт","confidence":0.97}]}

Допускается также legacy-массив [["наименование",qty,"шт"], ...] если schema недоступна.

Правила:
- Наименование перепиши дословно целиком: DIN/ГОСТ/размер/покрытие.
- Количество — только колонка количества; НЕ путай с ценой и размером.
- Не выдумывай цены, SKU, остатки и ссылки — их нет в твоей роли.
- Если таблица пуста — верни {"lines":[]}.`;

function lmStudioChatUrl() {
  const base =
    process.env.LMSTUDIO_BASE_PATH ||
    llmDefaults.LMSTUDIO_BASE_PATH ||
    "http://87.228.90.43:1234/v1";
  return `${String(base).replace(/\/$/, "")}/chat/completions`;
}

function resolveVisionOcrEndpoint() {
  if (shouldUseTeacherLlm()) {
    return {
      url: `${resolveOpenRouterBaseUrl()}/chat/completions`,
      modelId: resolveTeacherModel(),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveOpenRouterApiKey()}`,
        ...resolveOpenRouterHeaders(),
      },
      engine: "qwen3-vl",
      teacher: true,
    };
  }

  const apiKey = process.env.LMSTUDIO_AUTH_TOKEN || null;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  return {
    url: lmStudioChatUrl(),
    modelId: resolvePipelineVisionModel(),
    headers,
    engine: "qwen3-vl-thinking-json",
    teacher: false,
  };
}

function extractJsonArray(text) {
  if (typeof text !== "string") return null;
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try {
      const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
      const lines = parseOcrLinesPayload(parsed);
      if (lines) return lines;
    } catch {
      /* fall through to legacy array */
    }
  }

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parseOcrLinesPayload(parsed);
  } catch {
    return null;
  }
}

/**
 * Convert OCR JSON lines into plain inquiry text for parseInquiryText.
 * @param {Array<object>} lines
 * @returns {string}
 */
function inquiryTextFromOcrJsonLines(lines = []) {
  if (!Array.isArray(lines) || !lines.length) return "";
  return lines
    .map((row, index) => {
      if (row == null) return "";
      if (typeof row === "string") return row.trim();
      if (Array.isArray(row)) {
        const name = String(row[0] || "").trim();
        if (!name) return "";
        const qty = row[1];
        const unit = String(row[2] || "шт").trim() || "шт";
        const qtyPart =
          qty != null && String(qty).trim() !== "" ? ` — ${qty} ${unit}` : "";
        return `${index + 1}. ${name}${qtyPart}`;
      }
      const name = String(
        row.name_verbatim ||
          row.name ||
          row.title ||
          row.наименование ||
          ""
      ).trim();
      if (!name) return "";
      const qty = row.qty ?? row.quantity ?? row.кол_во ?? row.count;
      const unit = String(row.unit || row.ед || "шт").trim() || "шт";
      const din =
        row.din && !new RegExp(`\\bDIN\\s*${row.din}\\b`, "i").test(name)
          ? ` DIN ${row.din}`
          : "";
      const gost =
        row.gost &&
        !new RegExp(`(?:ГОСТ|GOST)\\s*${row.gost}\\b`, "i").test(name)
          ? ` ГОСТ ${row.gost}`
          : "";
      const notes = row.notes ? ` (${row.notes})` : "";
      const qtyPart =
        qty != null && String(qty).trim() !== "" ? ` — ${qty} ${unit}` : "";
      return `${index + 1}. ${name}${din}${gost}${qtyPart}${notes}`.trim();
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {string} raw
 * @returns {{ text: string, lines: object[]|null, format: "json"|"text" }}
 */
function normalizeVisionOcrResponse(raw) {
  const content = String(raw || "").trim();
  const lines = extractJsonArray(content);
  if (lines) {
    const text = inquiryTextFromOcrJsonLines(lines);
    if (text) return { text, lines, format: "json" };
  }
  return { text: content, lines: null, format: "text" };
}

async function visionOcrImageBuffer(imageBuffer, modelId, opts = {}) {
  const base64 = imageBuffer.toString("base64");
  const endpoint = resolveVisionOcrEndpoint();
  const resolvedModel = endpoint.modelId || modelId;
  const useJson = opts.json !== false;
  const prompt = useJson ? VISION_OCR_JSON_PROMPT : VISION_OCR_PROMPT;

  const body = {
    model: resolvedModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    temperature: OFFER_KP_DETERMINISTIC_SAMPLING.temperature,
    top_p: OFFER_KP_DETERMINISTIC_SAMPLING.top_p,
    seed: OFFER_KP_DETERMINISTIC_SAMPLING.seed,
    max_tokens: 4096,
  };
  if (useJson) {
    body.response_format = RESPONSE_FORMATS.ocrLines;
  }

  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: endpoint.headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Constrained schema may be unsupported — retry once without response_format.
    if (useJson && body.response_format) {
      delete body.response_format;
      const retry = await fetch(endpoint.url, {
        method: "POST",
        headers: endpoint.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240_000),
      });
      const retryBody = await retry.json().catch(() => ({}));
      if (retry.ok) {
        return String(retryBody?.choices?.[0]?.message?.content || "").trim();
      }
    }
    const detail =
      responseBody?.error?.message ||
      responseBody?.message ||
      response.statusText ||
      "Vision OCR failed";
    throw new Error(String(detail));
  }

  return String(responseBody?.choices?.[0]?.message?.content || "").trim();
}

/**
 * Чтение PDF через Qwen3-VL Thinking (eyes) → JSON lines → inquiry text.
 */
async function visionOcrPdf(pdfPath, opts = {}) {
  const endpoint = resolveVisionOcrEndpoint();
  let modelId =
    endpoint.modelId || opts.modelId || resolvePipelineVisionModel();
  const startedAt = Date.now();

  if (!endpoint.teacher) {
    try {
      const loaded = await ensurePipelineModelLoaded("vision", {
        workspace: opts.workspace || null,
      });
      modelId = loaded.modelId || modelId;
    } catch (error) {
      offerKpLog("warn", "Vision OCR: failed to load eyes model", {
        model: modelId,
        error: error?.message || String(error),
      });
      throw error;
    }
  }

  const pages = await renderPdfPages(pdfPath, {
    dpi: Number(process.env.OFFER_KP_VISION_OCR_DPI) || 150,
    onPage: opts.onPage,
  });

  if (!pages.length) {
    throw new Error("Vision OCR: no pages rendered from PDF");
  }

  const parts = [];
  const allLines = [];
  let usedJson = false;

  for (const { pageNumber, buffer } of pages) {
    opts.onProgress?.({
      type: "ocr_progress",
      engine: endpoint.engine,
      page: pageNumber,
      total: pages.length,
    });
    let raw = await visionOcrImageBuffer(buffer, modelId, { json: true });
    let normalized = normalizeVisionOcrResponse(raw);

    // Prefer a second constrained JSON call over free-text fallback.
    if (normalized.format !== "json" || !normalized.text) {
      raw = await visionOcrImageBuffer(buffer, modelId, { json: true });
      normalized = normalizeVisionOcrResponse(raw);
    }
    if (normalized.format !== "json" || !normalized.text) {
      raw = await visionOcrImageBuffer(buffer, modelId, { json: false });
      normalized = normalizeVisionOcrResponse(raw);
    }

    if (normalized.format === "json" && normalized.lines) {
      usedJson = true;
      allLines.push(...normalized.lines);
    }
    parts.push(normalized.text);
    offerKpLog("info", "Vision OCR page done", {
      page: pageNumber,
      total: pages.length,
      chars: normalized.text.length,
      format: normalized.format,
      model: modelId,
      teacher: endpoint.teacher || false,
    });
  }

  const fullText = usedJson
    ? inquiryTextFromOcrJsonLines(allLines) ||
      parts.filter(Boolean).join("\n\n")
    : parts.filter(Boolean).join("\n\n");

  offerKpLog("info", "Vision OCR PDF complete", {
    pages: pages.length,
    chars: fullText.length,
    format: usedJson ? "json" : "text",
    durationMs: Date.now() - startedAt,
    model: modelId,
    teacher: endpoint.teacher || false,
  });

  return {
    text: fullText,
    lines: usedJson ? allLines : null,
    format: usedJson ? "json" : "text",
    modelId,
    engine: usedJson ? "qwen3-vl-thinking-json" : endpoint.engine,
  };
}

module.exports = {
  visionOcrPdf,
  visionOcrImageBuffer,
  VISION_OCR_PROMPT,
  VISION_OCR_JSON_PROMPT,
  extractJsonArray,
  inquiryTextFromOcrJsonLines,
  normalizeVisionOcrResponse,
};
