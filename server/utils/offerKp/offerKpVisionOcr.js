const llmDefaults = require("../../config/offerKp.llm.defaults");
const { resolveOfferKpChatModel } = require("../../config/offerKp.models");
const { offerKpLog } = require("../offerKpApp/offerKpLog");
const { resolveOpenRouterApiKey } = require("../offerKpApp/openRouterEnv");
const {
  shouldUseTeacherLlm,
  resolveTeacherModel,
} = require("../offerKpApp/teacherLlm");
const { renderPdfPages } = require("./offerKpPaddleOcr");

const VISION_OCR_PROMPT = `Извлеки весь текст с изображения заявки/спецификации.
Сохрани таблицу построчно: № | Наименование | Ед.изм. | Кол-во.
Кол-во — целые числа или кг из колонки «Кол-во». НЕ путай кол-во с ценой (руб/копейки).
Только извлечённый текст на русском, без комментариев.`;

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

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
      url: OPENROUTER_CHAT_URL,
      modelId: resolveTeacherModel(),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveOpenRouterApiKey()}`,
        "HTTP-Referer": "https://offerKp.com",
        "X-Title": "offer-kp",
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
    modelId: null,
    headers,
    engine: "qwen3-vl",
    teacher: false,
  };
}

async function visionOcrImageBuffer(imageBuffer, modelId) {
  const base64 = imageBuffer.toString("base64");
  const endpoint = resolveVisionOcrEndpoint();
  const resolvedModel = endpoint.modelId || modelId;

  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: endpoint.headers,
    body: JSON.stringify({
      model: resolvedModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_OCR_PROMPT },
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
      temperature: 0,
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(240_000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      body?.error?.message || body?.message || response.statusText || "Vision OCR failed";
    throw new Error(String(detail));
  }

  return String(body?.choices?.[0]?.message?.content || "").trim();
}

/**
 * Чтение PDF через Qwen3-VL (teacher OpenRouter или локальный LM Studio).
 */
async function visionOcrPdf(pdfPath, opts = {}) {
  const endpoint = resolveVisionOcrEndpoint();
  const modelId =
    endpoint.modelId ||
    opts.modelId ||
    resolveOfferKpChatModel(opts.workspace) ||
    llmDefaults.LMSTUDIO_MODEL_PREF;
  const startedAt = Date.now();

  const pages = await renderPdfPages(pdfPath, {
    dpi: Number(process.env.OFFER_KP_VISION_OCR_DPI) || 200,
    onPage: opts.onPage,
  });

  if (!pages.length) {
    throw new Error("Vision OCR: no pages rendered from PDF");
  }

  const parts = [];
  for (const { pageNumber, buffer } of pages) {
    opts.onProgress?.({
      type: "ocr_progress",
      engine: endpoint.engine,
      page: pageNumber,
      total: pages.length,
    });
    const text = await visionOcrImageBuffer(buffer, modelId);
    parts.push(text);
    offerKpLog("info", "Vision OCR page done", {
      page: pageNumber,
      total: pages.length,
      chars: text.length,
      model: modelId,
      teacher: endpoint.teacher || false,
    });
  }

  const fullText = parts.filter(Boolean).join("\n\n");
  offerKpLog("info", "Vision OCR PDF complete", {
    pages: pages.length,
    chars: fullText.length,
    durationMs: Date.now() - startedAt,
    model: modelId,
    teacher: endpoint.teacher || false,
  });
  return fullText;
}

module.exports = {
  visionOcrPdf,
  visionOcrImageBuffer,
  VISION_OCR_PROMPT,
};
