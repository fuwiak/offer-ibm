const { reqBody } = require("../utils/http");
const { PartnerRequest } = require("../models/partnerRequest");
const { LawyerRevizorroQuote } = require("../models/lawyerRevizorroQuote");
const { Workspace } = require("../models/workspace");
const { calculateQuote, LAWYER_REVIZORRO_PRODUCTS } = require("../utils/lawyerRevizorro/pricing");
const { lawyerRevizorroRoleGuard } = require("../utils/middleware/lawyerRevizorroRoleGuard");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { streamLawyerRevizorroPublicChat } = require("../utils/chats/lawyerRevizorroPublic");
const { LawyerRevizorroNotifications } = require("../models/lawyerRevizorroNotifications");
const { buildDashboardStats } = require("../utils/lawyerRevizorro/buildDashboardStats");

const NOTIFICATIONS_POLL_MS = Number(
  process.env.LAWYER_REVIZORRO_NOTIFICATIONS_POLL_MS || 20 * 60 * 1000
);
const NOTIFICATIONS_DISPLAY_LIMIT = Number(
  process.env.LAWYER_REVIZORRO_NOTIFICATIONS_LIMIT || 20
);
const { v4: uuidv4 } = require("uuid");
const {
  writeResponseChunk,
} = require("../utils/helpers/chat/responses");
const { generateQuotePdf } = require("../utils/lawyerRevizorro/generateQuotePdf");

function lawyerRevizorroEndpoints(app) {
  if (!app) return;

  app.get("/lawyerRevizorro/config", async (_request, response) => {
    try {
      const slug =
        process.env.LAWYER_REVIZORRO_PUBLIC_WORKSPACE || "lawyerRevizorro-public";
      const workspace = await Workspace.get({ slug });
      response.status(200).json({
        appName: process.env.LAWYER_REVIZORRO_APP_NAME || "lawyer-revizorro",
        publicWorkspaceSlug: slug,
        publicWorkspaceAvailable: !!workspace,
        products: LAWYER_REVIZORRO_PRODUCTS,
        languages: ["fr", "en", "it"],
      });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.get(
    "/lawyerRevizorro/notifications",
    [validatedRequest, lawyerRevizorroRoleGuard({ requireAuth: true })],
    async (_request, response) => {
      try {
        const user = response.locals.lawyerRevizorroUser;
        const notifications = await LawyerRevizorroNotifications.list({
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
    "/lawyerRevizorro/notifications/read-all",
    [validatedRequest, lawyerRevizorroRoleGuard({ requireAuth: true })],
    async (_request, response) => {
      try {
        const result = await LawyerRevizorroNotifications.markAllRead();
        response.status(200).json({ success: true, updated: result.count });
      } catch (e) {
        console.error(e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  app.get(
    "/lawyerRevizorro/dashboard/stats",
    [validatedRequest, lawyerRevizorroRoleGuard({ requireAuth: true })],
    async (_request, response) => {
      try {
        const user = response.locals.lawyerRevizorroUser;
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

  app.post("/lawyerRevizorro/partner-request", async (request, response) => {
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

  app.post("/lawyerRevizorro/public/stream-chat", async (request, response) => {
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

      await streamLawyerRevizorroPublicChat(response, message, sessionId, {
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
    "/lawyerRevizorro/quotes/preview",
    [lawyerRevizorroRoleGuard({ requireAuth: false })],
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
    "/lawyerRevizorro/quotes",
    [validatedRequest, lawyerRevizorroRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.lawyerRevizorroUser;
        if (user.role === "supplier") {
          return response
            .status(403)
            .json({ error: "Suppliers cannot create commercial quotes." });
        }
        const { lines, shipping, partnerId } = reqBody(request);
        const quote = await LawyerRevizorroQuote.create({
          userId: user.id,
          partnerId: partnerId ?? null,
          lines: lines || [],
          shipping: shipping ?? 0,
        });
        const formatted = LawyerRevizorroQuote.formatForClient(
          quote,
          response.locals.sanitizeLawyerRevizorroQuote,
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
    "/lawyerRevizorro/quotes",
    [validatedRequest, lawyerRevizorroRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.lawyerRevizorroUser;
        const quotes = await LawyerRevizorroQuote.listForUser(user.id, user.role);
        const formatted = quotes
          .map((q) =>
            LawyerRevizorroQuote.formatForClient(q, response.locals.sanitizeLawyerRevizorroQuote, {
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
    "/lawyerRevizorro/quotes/:reference",
    [validatedRequest, lawyerRevizorroRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.lawyerRevizorroUser;
        const quote = await LawyerRevizorroQuote.getByReferenceForRole(
          request.params.reference,
          user.role
        );
        const formatted = LawyerRevizorroQuote.formatForClient(
          quote,
          response.locals.sanitizeLawyerRevizorroQuote,
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
    "/lawyerRevizorro/quotes/:id/duplicate",
    [validatedRequest, lawyerRevizorroRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.lawyerRevizorroUser;
        const { lines, shipping } = reqBody(request);
        const duplicate = await LawyerRevizorroQuote.duplicate(request.params.id, {
          lines,
          shipping,
          userId: user.id,
        });
        if (!duplicate) {
          return response.status(404).json({ error: "Quote not found" });
        }
        const formatted = LawyerRevizorroQuote.formatForClient(
          duplicate,
          response.locals.sanitizeLawyerRevizorroQuote,
          { role: user.role }
        );
        response.status(200).json({ quote: formatted });
      } catch (e) {
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * POST /lawyerRevizorro/quotes/pdf
   * Generate a professional PDF for a quote (by reference or inline data).
   * Body: { reference?, customer, lines, shipping, subtotal, total, createdAt }
   */
  app.post(
    "/lawyerRevizorro/quotes/pdf",
    [validatedRequest, lawyerRevizorroRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.lawyerRevizorroUser;
        if (user.role === "supplier") {
          return response.status(403).json({ error: "Access denied." });
        }
        const body = reqBody(request);

        // Optionally load quote from DB by reference
        let quoteData = body;
        if (body.reference && !body.lines) {
          const dbQuote = await LawyerRevizorroQuote.getByReferenceForRole(body.reference, user.role);
          if (!dbQuote) return response.status(404).json({ error: "Quote not found" });
          const formatted = LawyerRevizorroQuote.formatForClient(dbQuote, (q) => q, { role: user.role });
          quoteData = { ...formatted, customer: body.customer || {}, contact: body.contact };
        }

        const result = await generateQuotePdf(quoteData);
        response.status(200).json({
          filename: result.filename,
          storageFilename: result.storageFilename,
          fileSize: result.fileSize,
        });
      } catch (e) {
        console.error("[lawyerRevizorro] PDF generation error:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );

  /**
   * GET /lawyerRevizorro/quotes/pdf/:filename
   * Download a previously generated quote PDF.
   */
  app.get(
    "/lawyerRevizorro/quotes/pdf/:filename",
    [validatedRequest, lawyerRevizorroRoleGuard({ requireAuth: true })],
    async (request, response) => {
      try {
        const user = response.locals.lawyerRevizorroUser;
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
        console.error("[lawyerRevizorro] PDF download error:", e);
        response.status(500).json({ error: e.message });
      }
    }
  );
}

module.exports = { lawyerRevizorroEndpoints };
