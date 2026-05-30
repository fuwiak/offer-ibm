const { reqBody } = require("../utils/http");
const { PartnerRequest } = require("../models/partnerRequest");
const { OfferKpQuote } = require("../models/offerKpQuote");
const { Workspace } = require("../models/workspace");
const { calculateQuote, OFFER_KP_PRODUCTS } = require("../utils/offerKpApp/pricing");
const { offerKpRoleGuard } = require("../utils/middleware/offerKpRoleGuard");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { streamOfferKpPublicChat } = require("../utils/chats/offerKpPublic");
const { OfferKpNotifications } = require("../models/offerKpNotifications");
const { buildDashboardStats } = require("../utils/offerKpApp/buildDashboardStats");

const NOTIFICATIONS_POLL_MS = Number(
  process.env.OFFER_KP_NOTIFICATIONS_POLL_MS || 20 * 60 * 1000
);
const NOTIFICATIONS_DISPLAY_LIMIT = Number(
  process.env.OFFER_KP_NOTIFICATIONS_LIMIT || 20
);
const { v4: uuidv4 } = require("uuid");
const {
  writeResponseChunk,
} = require("../utils/helpers/chat/responses");
const { generateQuotePdf } = require("../utils/offerKpApp/generateQuotePdf");
const { generateQuoteDocx } = require("../utils/offerKpApp/generateQuoteDocx");
const { generateDocxFromMarkdown } = require("../utils/offerKpApp/docxFromMarkdown");

function offerKpEndpoints(app) {
  if (!app) return;

  app.get("/offerKp/config", async (_request, response) => {
    try {
      const slug =
        process.env.OFFER_KP_PUBLIC_WORKSPACE || "offerKp-public";
      const workspace = await Workspace.get({ slug });
      response.status(200).json({
        appName: process.env.OFFER_KP_APP_NAME || "OfferKP",
        publicWorkspaceSlug: slug,
        publicWorkspaceAvailable: !!workspace,
        products: OFFER_KP_PRODUCTS,
        languages: ["fr", "en", "it"],
      });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.get(
    "/offerKp/notifications",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (_request, response) => {
      try {
        const user = response.locals.offerKpUser;
        const notifications = await OfferKpNotifications.list({
          limit: NOTIFICATIONS_DISPLAY_LIMIT,
          userId: user?.id,
          role: user?.role,
        });
        const unreadCount = notifications.filter((n) => !n.read).length;
        response.status(200).json({
          notifications,
          unreadCount,
          pollIntervalMs: NOTIFICATIONS_POLL_MS,
        });
      } catch (e) {
        console.error(e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.post(
    "/offerKp/notifications/read-all",
    [validatedRequest, offerKpRoleGuard({ requireAuth: true })],
    async (_request, response) => {
      try {
        const result = await OfferKpNotifications.markAllRead();
        response.status(200).json({ success: true, updated: result.count });
      } catch (e) {
        console.error(e);
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
            OfferKpQuote.formatForClient(q, response.locals.sanitizeOfferKpQuote, {
              role: user.role,
            })
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
          const dbQuote = await OfferKpQuote.getByReferenceForRole(body.reference, user.role);
          if (!dbQuote) return response.status(404).json({ error: "Quote not found" });
          const formatted = OfferKpQuote.formatForClient(dbQuote, (q) => q, { role: user.role });
          quoteData = { ...formatted, customer: body.customer || {}, contact: body.contact };
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
        response.setHeader("Content-Disposition", `inline; filename="${filename}"`);
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
}

module.exports = { offerKpEndpoints };
