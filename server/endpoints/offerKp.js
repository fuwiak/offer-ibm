const { reqBody } = require("../utils/http");
const { PartnerRequest } = require("../models/partnerRequest");
const { OfferKpQuote } = require("../models/offerKpQuote");
const { Workspace } = require("../models/workspace");
const {
  calculateQuote,
  OFFER_KP_PRODUCTS,
} = require("../utils/offerKpApp/pricing");
const { offerKpRoleGuard } = require("../utils/middleware/offerKpRoleGuard");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { streamOfferKpPublicChat } = require("../utils/chats/offerKpPublic");
const {
  buildDashboardStats,
} = require("../utils/offerKpApp/buildDashboardStats");
const {
  OFFER_KP_ALLOWED_MODELS,
  OFFER_KP_DEFAULT_MODEL,
  OFFER_KP_MODEL_GROUPS,
} = require("../config/offerKp.models");

const { v4: uuidv4 } = require("uuid");
const { writeResponseChunk } = require("../utils/helpers/chat/responses");
const { generateQuotePdf } = require("../utils/offerKpApp/generateQuotePdf");
const { generateQuoteDocx } = require("../utils/offerKpApp/generateQuoteDocx");
const { generateQuoteXlsx } = require("../utils/offerKpApp/generateQuoteXlsx");
const {
  generateDocxFromMarkdown,
} = require("../utils/offerKpApp/docxFromMarkdown");
const { matchInquiryToDraft } = require("../utils/offerKp/matchInquiryLines");
const {
  loadLmStudioModel,
} = require("../utils/offerKpApp/lmStudioModels");
const {
  runProductSearchAgent,
} = require("../utils/offerKp/productSearchAgent");
const { OfferKpCorrectionLog } = require("../models/offerKpCorrectionLog");
const shopDbExplorer = require("../utils/offerKp/db/explorer");
const { askShopDb } = require("../utils/offerKp/db/askAgent");

function isOfferKpQwenModelId(modelId) {
  const id = String(modelId || "").trim().toLowerCase();
  if (!id) return false;
  return id.split("/")[0] === "qwen";
}

function offerKpEndpoints(app) {
  if (!app) return;

  app.get("/offerKp/config", async (_request, response) => {
    try {
      const slug = process.env.OFFER_KP_PUBLIC_WORKSPACE || "offerKp-public";
      const workspace = await Workspace.get({ slug });
      response.status(200).json({
        appName: process.env.OFFER_KP_APP_NAME || "OfferKP",
        publicWorkspaceSlug: slug,
        publicWorkspaceAvailable: !!workspace,
        products: OFFER_KP_PRODUCTS,
        languages: ["fr", "en", "it"],
        llmProvider: process.env.LLM_PROVIDER || "lmstudio",
        defaultModel: process.env.LMSTUDIO_MODEL_PREF || OFFER_KP_DEFAULT_MODEL,
        allowedModels: OFFER_KP_ALLOWED_MODELS,
        modelGroups: OFFER_KP_MODEL_GROUPS,
      });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.post(
    "/offerKp/lmstudio/load-model",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const { modelId } = reqBody(request);
        const id = String(modelId || "").trim();
        if (!id) {
          return response.status(400).json({ error: "modelId is required" });
        }
        if (!isOfferKpQwenModelId(id)) {
          return response
            .status(400)
            .json({ error: "Only Qwen models can be loaded from OfferKP." });
        }
        const result = await loadLmStudioModel(id);
        response.status(200).json(result);
      } catch (e) {
        console.error("[offerKp] LM Studio load-model:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.get(
    "/offerKp/dashboard/stats",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (_request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user?.role && user.role !== "admin") {
          return response.status(403).json({ error: "Admin access required." });
        }
        const stats = await buildDashboardStats();
        response.status(200).json(stats);
      } catch (e) {
        console.error(e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.post("/offerKp/partner-request", async (request, response) => {
    try {
      const { company, email, country, message } = reqBody(request);
      if (!company || !email) {
        return response.status(400).json({
          success: false,
          error: "company and email are required",
        });
      }
      const record = await PartnerRequest.create({
        company,
        email,
        country,
        message,
      });
      response.status(200).json({ success: true, id: record.id });
    } catch (e) {
      console.error(e);
      response.status(500).json({ success: false, error: e.message });
    }
  });

  app.post("/offerKp/public/stream-chat", async (request, response) => {
    try {
      const { message, sessionId, language = null } = reqBody(request);
      if (!message) {
        return response.status(400).json({ error: "message is required" });
      }

      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Connection", "keep-alive");
      response.flushHeaders();

      await streamOfferKpPublicChat(response, message, sessionId, {
        language,
      });
      response.end();
    } catch (e) {
      console.error(e);
      writeResponseChunk(response, {
        id: uuidv4(),
        type: "abort",
        textResponse: null,
        sources: [],
        close: true,
        error: e.message,
      });
      response.end();
    }
  });

  app.post(
    "/offerKp/quotes/preview",
    [offerKpRoleGuard({ requireAuth: false })],
    async (request, response) => {
      try {
        const { lines, shipping } = reqBody(request);
        const preview = calculateQuote(lines || [], { shipping });
        response.status(200).json({ preview });
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.post(
    "/offerKp/quotes",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user.role === "supplier") {
          return response
            .status(403)
            .json({ error: "Suppliers cannot create commercial quotes." });
        }
        const { lines, shipping, partnerId } = reqBody(request);
        const quote = await OfferKpQuote.create({
          userId: user.id,
          partnerId: partnerId ?? null,
          lines: lines || [],
          shipping: shipping ?? 0,
        });
        const formatted = OfferKpQuote.formatForClient(
          quote,
          response.locals.sanitizeOfferKpQuote,
          { role: user.role }
        );
        response.status(200).json({ quote: formatted });
      } catch (e) {
        console.error(e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.get(
    "/offerKp/quotes",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        const quotes = await OfferKpQuote.listForUser(user.id, user.role);
        const formatted = quotes
          .map((q) =>
            OfferKpQuote.formatForClient(
              q,
              response.locals.sanitizeOfferKpQuote,
              {
                role: user.role,
              }
            )
          )
          .filter(Boolean);
        response.status(200).json({ quotes: formatted });
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.get(
    "/offerKp/quotes/:reference",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        const quote = await OfferKpQuote.getByReferenceForRole(
          request.params.reference,
          user.role
        );
        const formatted = OfferKpQuote.formatForClient(
          quote,
          response.locals.sanitizeOfferKpQuote,
          { role: user.role }
        );
        if (!formatted) {
          return response.status(404).json({ error: "Quote not found" });
        }
        response.status(200).json({ quote: formatted });
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.post(
    "/offerKp/quotes/:id/duplicate",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        const { lines, shipping } = reqBody(request);
        const duplicate = await OfferKpQuote.duplicate(request.params.id, {
          lines,
          shipping,
          userId: user.id,
        });
        if (!duplicate) {
          return response.status(404).json({ error: "Quote not found" });
        }
        const formatted = OfferKpQuote.formatForClient(
          duplicate,
          response.locals.sanitizeOfferKpQuote,
          { role: user.role }
        );
        response.status(200).json({ quote: formatted });
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * POST /offerKp/quotes/pdf
   * Generate a professional PDF for a quote (by reference or inline data).
   * Body: { reference?, customer, lines, shipping, subtotal, total, createdAt }
   */
  app.post(
    "/offerKp/quotes/pdf",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user.role === "supplier") {
          return response.status(403).json({ error: "Access denied." });
        }
        const body = reqBody(request);

        // Optionally load quote from DB by reference
        let quoteData = body;
        if (body.reference && !body.lines) {
          const dbQuote = await OfferKpQuote.getByReferenceForRole(
            body.reference,
            user.role
          );
          if (!dbQuote)
            return response.status(404).json({ error: "Quote not found" });
          const formatted = OfferKpQuote.formatForClient(dbQuote, (q) => q, {
            role: user.role,
          });
          quoteData = {
            ...formatted,
            customer: body.customer || {},
            contact: body.contact,
          };
        }

        const result = await generateQuotePdf(quoteData);
        response.status(200).json({
          filename: result.filename,
          storageFilename: result.storageFilename,
          fileSize: result.fileSize,
        });
      } catch (e) {
        console.error("[offerKp] PDF generation error:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * GET /offerKp/quotes/pdf/:filename
   * Download a previously generated quote PDF.
   */
  app.get(
    "/offerKp/quotes/pdf/:filename",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user.role === "supplier") {
          return response.status(403).json({ error: "Access denied." });
        }
        const { filename } = request.params;
        if (!filename || !filename.endsWith(".pdf")) {
          return response.status(400).json({ error: "Invalid filename" });
        }
        const path = require("path");
        const fs = require("fs");
        const storageDir = path.join(
          process.env.STORAGE_DIR || path.resolve(__dirname, "../storage"),
          "generated-files"
        );
        const filePath = path.join(storageDir, filename);
        if (!filePath.startsWith(storageDir)) {
          return response.status(400).json({ error: "Invalid path" });
        }
        if (!fs.existsSync(filePath)) {
          return response.status(404).json({ error: "File not found" });
        }
        response.setHeader("Content-Type", "application/pdf");
        response.setHeader(
          "Content-Disposition",
          `inline; filename="${filename}"`
        );
        fs.createReadStream(filePath).pipe(response);
      } catch (e) {
        console.error("[offerKp] PDF download error:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * POST /offerKp/quotes/docx
   * Generate a professional, editable Word (.docx) quotation.
   */
  app.post(
    "/offerKp/quotes/docx",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user.role === "supplier") {
          return response.status(403).json({ error: "Access denied." });
        }
        const body = reqBody(request);

        let quoteData = body;
        if (body.reference && !body.lines) {
          const dbQuote = await OfferKpQuote.getByReferenceForRole(
            body.reference,
            user.role
          );
          if (!dbQuote)
            return response.status(404).json({ error: "Quote not found" });
          const formatted = OfferKpQuote.formatForClient(dbQuote, (q) => q, {
            role: user.role,
          });
          quoteData = {
            ...formatted,
            customer: body.customer || {},
            contact: body.contact,
            currency: body.currency,
            vatRate: body.vatRate,
          };
        }

        const result = await generateQuoteDocx(quoteData);
        response.status(200).json({
          filename: result.filename,
          storageFilename: result.storageFilename,
          fileSize: result.fileSize,
        });
      } catch (e) {
        console.error("[offerKp] DOCX generation error:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * POST /offerKp/quotes/docx-from-markdown
   * Generate Word (.docx) from markdown (matches in-app document preview).
   */
  app.post(
    "/offerKp/quotes/docx-from-markdown",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user.role === "supplier") {
          return response.status(403).json({ error: "Access denied." });
        }
        const { markdown, filename } = reqBody(request);
        if (!markdown || typeof markdown !== "string") {
          return response.status(400).json({ error: "Markdown is required" });
        }
        const result = await generateDocxFromMarkdown({ markdown, filename });
        response.status(200).json({
          filename: result.filename,
          storageFilename: result.storageFilename,
          fileSize: result.fileSize,
        });
      } catch (e) {
        console.error("[offerKp] DOCX-from-markdown error:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * GET /offerKp/quotes/docx/:filename
   * Download a previously generated quote Word document.
   */
  app.get(
    "/offerKp/quotes/docx/:filename",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user.role === "supplier") {
          return response.status(403).json({ error: "Access denied." });
        }
        const { filename } = request.params;
        if (!filename || !filename.endsWith(".docx")) {
          return response.status(400).json({ error: "Invalid filename" });
        }
        const path = require("path");
        const fs = require("fs");
        const storageDir = path.join(
          process.env.STORAGE_DIR || path.resolve(__dirname, "../storage"),
          "generated-files"
        );
        const filePath = path.join(storageDir, filename);
        if (!filePath.startsWith(storageDir)) {
          return response.status(400).json({ error: "Invalid path" });
        }
        if (!fs.existsSync(filePath)) {
          return response.status(404).json({ error: "File not found" });
        }
        response.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        response.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
        fs.createReadStream(filePath).pipe(response);
      } catch (e) {
        console.error("[offerKp] DOCX download error:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * POST /offerKp/inquiry/match
   * Сверка текста заявки с каталогом → черновик КП со статусами и аналогами.
   */
  app.post(
    "/offerKp/inquiry/match",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const { message, chatHistory, parsedText } = reqBody(request);
        const inquirySource = [parsedText, message]
          .filter(Boolean)
          .join("\n\n");
        if (!inquirySource.trim()) {
          return response.status(400).json({ error: "message is required" });
        }
        const draft = await matchInquiryToDraft(inquirySource, { chatHistory });
        response.status(200).json({ draft });
      } catch (e) {
        console.error("[offerKp] inquiry match:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * POST /offerKp/products/search
   * Поиск позиций в каталоге для ручного добавления в черновик.
   */
  app.post(
    "/offerKp/products/search",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const { query: q, limit = 10 } = reqBody(request);
        if (!q)
          return response.status(400).json({ error: "query is required" });
        const result = await runProductSearchAgent({ message: q, limit });
        response.status(200).json({
          products: result.products,
          strategies: result.strategies,
        });
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * POST /offerKp/corrections
   * Лог правок оператора для дообучения.
   */
  app.post(
    "/offerKp/corrections",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        const body = reqBody(request);
        const corrections = Array.isArray(body.corrections)
          ? body.corrections
          : [body];
        const saved = await OfferKpCorrectionLog.logBatch(user.id, corrections);
        response.status(200).json({ success: true, count: saved.length });
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * GET /offerKp/corrections/export
   * Экспорт правок для fine-tuning.
   */
  app.get(
    "/offerKp/corrections/export",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user?.role !== "admin") {
          return response.status(403).json({ error: "Admin access required." });
        }
        const data = await OfferKpCorrectionLog.exportTrainingJson();
        response.status(200).json({ corrections: data });
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * POST /offerKp/quotes/xlsx
   * Экспорт КП в XLSX для 1С.
   */
  app.post(
    "/offerKp/quotes/xlsx",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user.role === "supplier") {
          return response.status(403).json({ error: "Access denied." });
        }
        const body = reqBody(request);
        let quoteData = body;
        if (body.reference && !body.lines) {
          const dbQuote = await OfferKpQuote.getByReferenceForRole(
            body.reference,
            user.role
          );
          if (!dbQuote)
            return response.status(404).json({ error: "Quote not found" });
          const formatted = OfferKpQuote.formatForClient(dbQuote, (q) => q, {
            role: user.role,
          });
          quoteData = { ...formatted, lines: formatted.preview?.lines || [] };
        }
        const result = await generateQuoteXlsx(quoteData);
        response.status(200).json({
          filename: result.filename,
          storageFilename: result.storageFilename,
          fileSize: result.fileSize,
        });
      } catch (e) {
        console.error("[offerKp] XLSX generation error:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * GET /offerKp/quotes/xlsx/:filename
   */
  app.get(
    "/offerKp/quotes/xlsx/:filename",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.offerKpUser;
        if (user.role === "supplier") {
          return response.status(403).json({ error: "Access denied." });
        }
        const { filename } = request.params;
        if (!filename || !filename.endsWith(".xlsx")) {
          return response.status(400).json({ error: "Invalid filename" });
        }
        const path = require("path");
        const fs = require("fs");
        const storageDir = path.join(
          process.env.STORAGE_DIR || path.resolve(__dirname, "../storage"),
          "generated-files"
        );
        const filePath = path.join(storageDir, filename);
        if (!filePath.startsWith(storageDir)) {
          return response.status(400).json({ error: "Invalid path" });
        }
        if (!fs.existsSync(filePath)) {
          return response.status(404).json({ error: "File not found" });
        }
        response.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        response.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`
        );
        fs.createReadStream(filePath).pipe(response);
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  // ───────────────────────────────────────────────────────────────────────
  // ShopDB explorer (admin only) — просмотр каталога и read-only SELECT в UI.
  // ───────────────────────────────────────────────────────────────────────

  const requireOfferKpAdmin = (response) => {
    const user = response.locals.offerKpUser;
    if (user?.role && user.role !== "admin") {
      response.status(403).json({ error: "Admin access required." });
      return false;
    }
    return true;
  };

  app.get(
    "/offerKp/db/status",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (_request, response) => {
      try {
        if (!requireOfferKpAdmin(response)) return;
        response.status(200).json(shopDbExplorer.dbStatus());
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.get(
    "/offerKp/db/tables",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (_request, response) => {
      try {
        if (!requireOfferKpAdmin(response)) return;
        const tables = await shopDbExplorer.listTables();
        response.status(200).json({ tables });
      } catch (e) {
        response.status(500).json({ error: e.message, code: e.code });
      }
    }
  );

  app.get(
    "/offerKp/db/tables/:table",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        if (!requireOfferKpAdmin(response)) return;
        const { table } = request.params;
        const columns = await shopDbExplorer.describeTable(table);
        const preview = await shopDbExplorer.runReadQuery(
          `SELECT * FROM \`${table}\``,
          { limit: 50 }
        );
        response.status(200).json({ table, columns, preview });
      } catch (e) {
        const status = e.code === "TABLE_NOT_FOUND" ? 404 : 500;
        response.status(status).json({ error: e.message, code: e.code });
      }
    }
  );

  app.post(
    "/offerKp/db/query",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        if (!requireOfferKpAdmin(response)) return;
        const { sql, limit } = reqBody(request);
        if (!sql || typeof sql !== "string") {
          return response.status(400).json({ error: "sql is required" });
        }
        const result = await shopDbExplorer.runReadQuery(sql, { limit });
        response.status(200).json(result);
      } catch (e) {
        if (e.code === "QUERY_REJECTED") {
          return response
            .status(400)
            .json({ error: e.message, code: e.code, reason: e.reason });
        }
        response.status(500).json({ error: e.message, code: e.code });
      }
    }
  );

  // Вопрос на естественном языке → SQL → ответ LLM по данным ShopDB.
  app.post(
    "/offerKp/db/ask",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        if (!requireOfferKpAdmin(response)) return;
        const { question, limit } = reqBody(request);
        if (!question || typeof question !== "string") {
          return response.status(400).json({ error: "question is required" });
        }
        const result = await askShopDb({ question, limit });
        response.status(200).json(result);
      } catch (e) {
        const status =
          e.code === "EMPTY_QUESTION"
            ? 400
            : e.code === "SHOP_DB_NOT_CONFIGURED"
              ? 503
              : 500;
        response.status(status).json({ error: e.message, code: e.code });
      }
    }
  );
}

module.exports = { offerKpEndpoints };
