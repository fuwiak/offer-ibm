const path = require("path");
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
const { OFFER_KP_DETERMINISTIC_SAMPLING } = require("./deterministicSampling");
const { RESPONSE_FORMATS, parseOcrLinesPayload } = require("./llmJsonSchema");
const {
  recordExperienceEvent,
  rememberExperienceAsync,
  retrieveExperiences,
} = require("./experienceMemory");

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

function formatExtractionMemory(examples = []) {
  if (!examples.length) return "";
  const rows = examples.map((row) => {
    const payload = row.payload || {};
    const output = payload.structured_output || payload;
    return [
      `Вход: ${payload.raw_ocr || row.retrieval_text}`,
      `Проверенный результат: ${JSON.stringify(output)}`,
    ].join("\n");
  });
  return [
    "Похожие проверенные примеры извлечения. Используй только как подсказку структуры; значения считывай с текущего изображения:",
    ...rows,
  ].join("\n\n");
}

function validateOcrLines(lines = []) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  if (!Array.isArray(lines) || !lines.length) {
    errors.push("no_rows_extracted");
    return { valid: false, errors, warnings };
  }

  lines.forEach((row, index) => {
    const name = String(
      row?.name_verbatim || row?.name || row?.title || row?.[0] || ""
    ).trim();
    const quantity = Number(
      row?.quantity ?? row?.qty ?? row?.count ?? row?.[1]
    );
    const unit = String(row?.unit || row?.ед || row?.[2] || "").trim();
    if (!name) errors.push(`row_${index + 1}:empty_name`);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`row_${index + 1}:invalid_quantity`);
    } else if (quantity > 1_000_000) {
      warnings.push(`row_${index + 1}:implausible_quantity`);
    }
    if (!unit) warnings.push(`row_${index + 1}:missing_unit`);
    const key = `${name.toLowerCase()}|${quantity}|${unit.toLowerCase()}`;
    if (seen.has(key)) warnings.push(`row_${index + 1}:duplicate_row`);
    seen.add(key);
  });
  return { valid: errors.length === 0, errors, warnings };
}

function buildVisionPrompt({ memoryContext = "", retryFeedback = "" } = {}) {
  return [
    VISION_OCR_JSON_PROMPT,
    memoryContext,
    retryFeedback
      ? [
          "Предыдущая попытка не прошла кодовую проверку.",
          `Ошибки: ${retryFeedback}`,
          "Перечитай таблицу и исправь только ошибки извлечения. Не копируй количество в размер или наименование.",
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

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
        row.name_verbatim || row.name || row.title || row.наименование || ""
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
  const prompt = useJson
    ? buildVisionPrompt({
        memoryContext: opts.memoryContext,
        retryFeedback: opts.retryFeedback,
      })
    : VISION_OCR_PROMPT;

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
  const contextText = String(opts.contextText || "").trim();
  const extractionMemories = contextText
    ? await retrieveExperiences("extraction_example_memory", contextText, {
        limit: 3,
        minSimilarity: 0.55,
      })
    : [];
  const layoutMemories = contextText
    ? await retrieveExperiences("document_layout_memory", contextText, {
        limit: 2,
        minSimilarity: 0.58,
      })
    : [];
  const memoryContext = formatExtractionMemory([
    ...layoutMemories,
    ...extractionMemories,
  ]);
  const startEvent = recordExperienceEvent("extraction_started", {
    input_id: path.basename(pdfPath),
    input_preview: contextText.slice(0, 2_000),
    pipeline_stage: "vision_ocr",
    model: endpoint.modelId,
    retrieved_examples: extractionMemories.length + layoutMemories.length,
  });

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
    let raw = await visionOcrImageBuffer(buffer, modelId, {
      json: true,
      memoryContext,
    });
    let normalized = normalizeVisionOcrResponse(raw);
    let validation = validateOcrLines(normalized.lines || []);

    // Retry the page with deterministic validator feedback instead of asking
    // the model the same question twice.
    if (
      normalized.format !== "json" ||
      !normalized.text ||
      !validation.valid ||
      validation.warnings.length > 0
    ) {
      raw = await visionOcrImageBuffer(buffer, modelId, {
        json: true,
        memoryContext,
        retryFeedback: [...validation.errors, ...validation.warnings].join(
          ", "
        ),
      });
      normalized = normalizeVisionOcrResponse(raw);
      validation = validateOcrLines(normalized.lines || []);
    }
    if (normalized.format !== "json" || !normalized.text) {
      raw = await visionOcrImageBuffer(buffer, modelId, { json: false });
      normalized = normalizeVisionOcrResponse(raw);
      validation = validateOcrLines(normalized.lines || []);
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
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
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

  const finalValidation = validateOcrLines(allLines);
  const completedEvent = recordExperienceEvent("extraction_completed", {
    input_id: path.basename(pdfPath),
    source_event_id: startEvent?.id || null,
    raw_output: allLines,
    model: modelId,
    pipeline_stage: "vision_ocr",
    validation_errors: finalValidation.errors,
    validation_warnings: finalValidation.warnings,
    trust_level: "automatic_prediction",
  });
  // Automatic output is retained for audit/analytics but is intentionally not
  // eligible for positive retrieval until an operator confirms it.
  if (fullText) {
    rememberExperienceAsync({
      namespace: "extraction_example_memory",
      retrievalText: [
        `RAW_OCR: ${contextText.slice(0, 4_000) || fullText.slice(0, 4_000)}`,
        `EXTRACTED: ${fullText.slice(0, 4_000)}`,
      ].join("\n"),
      payload: {
        raw_ocr: contextText.slice(0, 4_000) || null,
        structured_output: allLines,
        validation: finalValidation,
      },
      trustLevel: "automatic_prediction",
      sourceEventId: completedEvent?.id || null,
    });
  }

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
  formatExtractionMemory,
  validateOcrLines,
  buildVisionPrompt,
};
