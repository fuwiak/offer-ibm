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
const { prepareVisionImageBuffer } = require("./visionImagePrep");

/** Legacy plain-text OCR (fallback when JSON parse fails). */
const VISION_OCR_PROMPT = `Извлеки весь текст с изображения заявки/спецификации.
Сохрани таблицу построчно: № | Наименование | Ед.изм. | Кол-во.
Кол-во — целые числа или кг из колонки «Кол-во». НЕ путай кол-во с ценой (руб/копейки).
Только извлечённый текст на русском, без комментариев.`;

/**
 * Eyes only: extract line items as JSON. Never invent prices or SKUs —
 * catalog truth lives in ShopDB / matchInquiry.
 */
const VISION_OCR_JSON_PROMPT = `Ты — OCR глаз для заявки на крепёж / ведомости метизов. Извлеки ВСЕ позиции с изображения.

Верни ТОЛЬКО JSON-объект (без markdown и рассуждений):
{"lines":[{"source_page":1,"source_row":1,"name_verbatim":"полное наименование для поиска","quantity":100,"unit":"шт","gost":"7798-70","diameter_mm":16,"length_mm":55,"strength_class":"8.8","coating":"оцинк.","confidence":0.97}]}

Допускается также legacy-массив [["наименование",qty,"шт"], ...] если schema недоступна.

Правила:
- Таблица может быть «ВЕДОМОСТЬ МОНТАЖНЫХ МЕТИЗОВ» с колонками: Наименование, Диаметр, Толщина пакета, Длина, Кол-во, Вес, ГОСТ, Класс прочности, Примечания.
- name_verbatim собери ПОЛНОЕ обозначение для каталога, например:
  «Болт М16×55 ГОСТ 7798-70 кл.8.8 оцинк.» или «Гайка М20 ГОСТ 5915-70 кл.8 оцинк.» или «Шайба 16 ГОСТ 11371-78 оцинк.».
  Диаметр → М{d}; длину болта добавь как ×{L}; ГОСТ/класс/покрытие из соответствующих колонок.
- quantity — ТОЛЬКО колонка «Кол-во, шт.» (не вес кгс и не толщина пакета).
- unit обычно «шт»; вес не пиши как quantity.
- Не выдумывай цены, SKU, остатки и ссылки — их нет в твоей роли.
- Строку «Итого» не включай. Примечания 1–3 внизу листа — не позиции (кроме явной позиции вроде «химический анкер… — 20 шт»).
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
 * Builds catalog-ready names from ведомость columns when present.
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
      let name = String(
        row.name_verbatim || row.name || row.title || row.наименование || ""
      ).trim();
      if (!name) return "";

      const diameter = row.diameter_mm ?? row.diameter ?? row.dia ?? row.d;
      const length = row.length_mm ?? row.length ?? row.l;
      const strength =
        row.strength_class || row.strengthClass || row.class || "";
      const coating = row.coating || row.finish || "";

      // Compose MdxL if diameter present and not already in the name.
      if (diameter != null && String(diameter).trim() !== "") {
        const d = String(diameter).replace(/[^\d.,]/g, "").replace(",", ".");
        if (d && !new RegExp(`\\bM\\s*${d}\\b`, "i").test(name)) {
          const L =
            length != null && String(length).trim() !== ""
              ? String(length).replace(/[^\d.,]/g, "").replace(",", ".")
              : "";
          const size = L ? `М${d}×${L}` : `М${d}`;
          // "Болт" → "Болт М16×55 …"
          name = /\b(болт|гайка|шайба|винт|шпильк\w*)\b/i.test(name)
            ? name.replace(
                /\b(болт|гайка|шайба|винт|шпильк\w*)\b/i,
                `$1 ${size}`
              )
            : `${name} ${size}`;
        }
      }

      const din =
        row.din && !new RegExp(`\\bDIN\\s*${row.din}\\b`, "i").test(name)
          ? ` DIN ${row.din}`
          : "";
      const gostRaw = row.gost != null ? String(row.gost).trim() : "";
      const gost =
        gostRaw &&
        !new RegExp(
          `(?:ГОСТ|GOST)\\s*${gostRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
          "i"
        ).test(name)
          ? ` ГОСТ ${gostRaw}`
          : "";
      const strengthPart =
        strength &&
        !new RegExp(
          String(strength).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        ).test(name)
          ? ` кл.${strength}`
          : "";
      const coatingPart =
        coating &&
        !new RegExp(
          String(coating).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "i"
        ).test(name)
          ? ` ${coating}`
          : "";
      const notes = row.notes ? ` (${row.notes})` : "";
      const qty = row.qty ?? row.quantity ?? row.кол_во ?? row.count;
      const unit = String(row.unit || row.ед || "шт").trim() || "шт";
      const qtyPart =
        qty != null && String(qty).trim() !== "" ? ` — ${qty} ${unit}` : "";
      return `${index + 1}. ${name}${din}${gost}${strengthPart}${coatingPart}${qtyPart}${notes}`.trim();
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
  const prepared = await prepareVisionImageBuffer(imageBuffer, {
    mime: opts.mime,
  });
  const base64 = prepared.buffer.toString("base64");
  const endpoint = resolveVisionOcrEndpoint();
  const resolvedModel = endpoint.modelId || modelId;
  const useJson = opts.json !== false;
  const mime = prepared.mime || opts.mime || "image/png";
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
              url: `data:${mime};base64,${base64}`,
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
 * Run Qwen-VL OCR over one or more page image buffers (shared by PDF + photo).
 */
async function visionOcrPageBuffers(pages, modelId, opts = {}) {
  const endpoint = resolveVisionOcrEndpoint();
  const parts = [];
  const allLines = [];
  let usedJson = false;
  const mime = opts.mime || "image/png";

  for (const page of pages) {
    const { pageNumber, buffer } = page;
    const pageMime = page.mime || mime;
    opts.onProgress?.({
      type: "ocr_progress",
      engine: endpoint.engine,
      page: pageNumber,
      total: pages.length,
    });
    let raw = await visionOcrImageBuffer(buffer, modelId, {
      json: true,
      memoryContext: opts.memoryContext,
      mime: pageMime,
    });
    let normalized = normalizeVisionOcrResponse(raw);
    let validation = validateOcrLines(normalized.lines || []);

    // Retry only on hard failures — warnings (missing unit, duplicates) must
    // not double GPU time on an otherwise usable extraction.
    if (
      normalized.format !== "json" ||
      !normalized.text ||
      !validation.valid
    ) {
      raw = await visionOcrImageBuffer(buffer, modelId, {
        json: true,
        memoryContext: opts.memoryContext,
        retryFeedback: [...validation.errors, ...validation.warnings].join(
          ", "
        ),
        mime: pageMime,
      });
      normalized = normalizeVisionOcrResponse(raw);
      validation = validateOcrLines(normalized.lines || []);
    }
    if (normalized.format !== "json" || !normalized.text) {
      raw = await visionOcrImageBuffer(buffer, modelId, {
        json: false,
        mime: pageMime,
      });
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

  return {
    text: fullText,
    lines: usedJson ? allLines : null,
    format: usedJson ? "json" : "text",
    modelId,
    engine: usedJson ? "qwen3-vl-thinking-json" : endpoint.engine,
    usedJson,
    allLines,
  };
}

async function prepareVisionOcrSession(filePath, opts = {}) {
  const endpoint = resolveVisionOcrEndpoint();
  let modelId =
    endpoint.modelId || opts.modelId || resolvePipelineVisionModel();
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
    input_id: path.basename(filePath),
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

  return { endpoint, modelId, contextText, memoryContext, startEvent };
}

function finalizeVisionOcrResult({
  filePath,
  contextText,
  startEvent,
  modelId,
  startedAt,
  endpoint,
  result,
}) {
  offerKpLog("info", "Vision OCR complete", {
    file: path.basename(filePath),
    pages: result.usedJson ? (result.allLines?.length ? "json" : 0) : null,
    chars: result.text.length,
    format: result.format,
    durationMs: Date.now() - startedAt,
    model: modelId,
    teacher: endpoint.teacher || false,
  });

  const finalValidation = validateOcrLines(result.allLines || []);
  const completedEvent = recordExperienceEvent("extraction_completed", {
    input_id: path.basename(filePath),
    source_event_id: startEvent?.id || null,
    raw_output: result.allLines,
    model: modelId,
    pipeline_stage: "vision_ocr",
    validation_errors: finalValidation.errors,
    validation_warnings: finalValidation.warnings,
    trust_level: "automatic_prediction",
  });
  if (result.text) {
    rememberExperienceAsync({
      namespace: "extraction_example_memory",
      retrievalText: [
        `RAW_OCR: ${contextText.slice(0, 4_000) || result.text.slice(0, 4_000)}`,
        `EXTRACTED: ${result.text.slice(0, 4_000)}`,
      ].join("\n"),
      payload: {
        raw_ocr: contextText.slice(0, 4_000) || null,
        structured_output: result.allLines,
        validation: finalValidation,
      },
      trustLevel: "automatic_prediction",
      sourceEventId: completedEvent?.id || null,
    });
  }

  return {
    text: result.text,
    lines: result.lines,
    format: result.format,
    modelId,
    engine: result.engine,
  };
}

/**
 * Photo / scan image → Qwen3-VL JSON lines → inquiry text.
 */
async function visionOcrImageFile(imagePath, opts = {}) {
  const fs = require("fs");
  const { imageMimeFromFilename } = require("../parsedFileOriginal");
  const startedAt = Date.now();
  const { endpoint, modelId, contextText, memoryContext, startEvent } =
    await prepareVisionOcrSession(imagePath, opts);

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Vision OCR: image not found (${imagePath})`);
  }
  const buffer = fs.readFileSync(imagePath);
  const mime = opts.mime || imageMimeFromFilename(imagePath);
  const result = await visionOcrPageBuffers(
    [{ pageNumber: 1, buffer }],
    modelId,
    {
      memoryContext,
      onProgress: opts.onProgress,
      mime,
    }
  );

  return finalizeVisionOcrResult({
    filePath: imagePath,
    contextText,
    startEvent,
    modelId,
    startedAt,
    endpoint,
    result,
  });
}

/**
 * PDF or image path → vision OCR.
 */
async function visionOcrFile(filePath, opts = {}) {
  const { isImageFilename, isPdfFilename } = require("../parsedFileOriginal");
  if (isImageFilename(filePath) || opts.asImage) {
    return visionOcrImageFile(filePath, opts);
  }
  if (!isPdfFilename(filePath) && opts.forceImage) {
    return visionOcrImageFile(filePath, opts);
  }
  return visionOcrPdf(filePath, opts);
}

/**
 * Чтение PDF через Qwen3-VL Thinking (eyes) → JSON lines → inquiry text.
 */
async function visionOcrPdf(pdfPath, opts = {}) {
  const startedAt = Date.now();
  const { endpoint, modelId, contextText, memoryContext, startEvent } =
    await prepareVisionOcrSession(pdfPath, opts);

  const pages = await renderPdfPages(pdfPath, {
    dpi: Number(process.env.OFFER_KP_VISION_OCR_DPI) || 120,
    onPage: opts.onPage,
  });

  if (!pages.length) {
    throw new Error("Vision OCR: no pages rendered from PDF");
  }

  const result = await visionOcrPageBuffers(pages, modelId, {
    memoryContext,
    onProgress: opts.onProgress,
    mime: pages[0]?.mime || "image/jpeg",
  });

  return finalizeVisionOcrResult({
    filePath: pdfPath,
    contextText,
    startEvent,
    modelId,
    startedAt,
    endpoint,
    result,
  });
}

module.exports = {
  visionOcrPdf,
  visionOcrImageFile,
  visionOcrFile,
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
