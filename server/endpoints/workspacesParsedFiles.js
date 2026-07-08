const { reqBody, multiUserMode, userFromSession } = require("../utils/http");
const { handleFileUpload } = require("../utils/files/multer");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { Telemetry } = require("../models/telemetry");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { EventLogs } = require("../models/eventLogs");
const { validWorkspaceSlug } = require("../utils/middleware/validWorkspace");
const { CollectorApi } = require("../utils/collectorApi");
const { WorkspaceThread } = require("../models/workspaceThread");
const { WorkspaceParsedFiles } = require("../models/workspaceParsedFiles");
const {
  countContentLines,
  isTabularFilename,
} = require("../utils/parsedFilePreview");
const { archiveUploadedPdfOriginal } = require("../utils/parsedFileOriginal");
const {
  hasRestrictedContent,
  getRestrictedMessage,
} = require("../utils/restrictedContent");
const { writeResponseChunk } = require("../utils/helpers/chat/responses");

function workspaceParsedFilesEndpoints(app) {
  if (!app) return;

  app.get(
    "/workspace/:slug/parsed-files",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const threadSlug = request.query.threadSlug || null;
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const thread = threadSlug
          ? await WorkspaceThread.get({ slug: String(threadSlug) })
          : null;
        const { files, contextWindow, currentContextTokenCount } =
          await WorkspaceParsedFiles.getContextMetadataAndLimits(
            workspace,
            thread || null,
            multiUserMode(response) ? user : null
          );

        return response
          .status(200)
          .json({ files, contextWindow, currentContextTokenCount });
      } catch (e) {
        console.error(e.message, e);
        return response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/workspace/:slug/parsed-files/:fileId/preview",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const { fileId } = request.params;
        const threadSlug = request.query.threadSlug || null;
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const thread = threadSlug
          ? await WorkspaceThread.get({ slug: String(threadSlug) })
          : null;
        const { preview, error } = await WorkspaceParsedFiles.getFilePreview({
          workspace,
          fileId,
          user: multiUserMode(response) ? user : null,
          thread: thread || null,
          options: {
            limit: request.query.limit,
            offset: request.query.offset,
            sheetIndex: request.query.sheetIndex,
          },
        });

        if (!preview) {
          const status = error === "NOT_FOUND" ? 404 : 500;
          return response.status(status).json({ preview: null, error });
        }

        return response.status(200).json({ preview, error: null });
      } catch (e) {
        console.error(e.message, e);
        return response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/workspace/:slug/parsed-files/:fileId/original",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const { fileId } = request.params;
        const threadSlug = request.query.threadSlug || null;
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const thread = threadSlug
          ? await WorkspaceThread.get({ slug: String(threadSlug) })
          : null;
        const { file, error } = await WorkspaceParsedFiles.getOriginalFile({
          workspace,
          fileId,
          user: multiUserMode(response) ? user : null,
          thread: thread || null,
        });

        if (!file) {
          const status =
            error === "NOT_FOUND" || error === "NO_ORIGINAL" ? 404 : 500;
          return response.status(status).json({ error: error || "NOT_FOUND" });
        }

        const fs = require("fs");
        response.setHeader("Content-Type", file.contentType);
        response.setHeader(
          "Content-Disposition",
          `inline; filename="${file.filename}"`
        );
        fs.createReadStream(file.filePath).pipe(response);
      } catch (e) {
        console.error(e.message, e);
        return response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/workspace/:slug/delete-parsed-files",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async function (request, response) {
      try {
        const { fileIds = [] } = reqBody(request);
        if (!fileIds.length) return response.sendStatus(400).end();
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const success = await WorkspaceParsedFiles.delete({
          id: {
            in: fileIds.map((id) => parseInt(id)),
          },
          ...(user ? { userId: user.id } : {}),
          workspaceId: workspace.id,
        });
        return response.status(success ? 200 : 403).end();
      } catch (e) {
        console.error(e.message, e);
        return response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/workspace/:slug/parsed-files/assign-thread",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async function (request, response) {
      try {
        const { fileIds = [], threadSlug = null } = reqBody(request);
        if (!Array.isArray(fileIds) || !fileIds.length || !threadSlug) {
          return response.status(400).json({
            success: false,
            error: "fileIds and threadSlug are required",
          });
        }

        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const thread = await WorkspaceThread.get({
          slug: String(threadSlug),
          workspace_id: workspace.id,
          ...(user ? { user_id: user.id } : {}),
        });

        if (!thread) {
          return response.status(404).json({
            success: false,
            error: "Thread not found",
          });
        }

        const assigned = await WorkspaceParsedFiles.assignToThread({
          fileIds,
          workspaceId: workspace.id,
          threadId: thread.id,
          userId: user?.id || null,
        });

        return response.status(200).json({ success: true, assigned });
      } catch (e) {
        console.error(e.message, e);
        return response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/workspace/:slug/embed-parsed-file/:fileId",
    [
      validatedRequest,
      // Embed is still an admin/manager only feature
      flexUserRoleValid([ROLES.admin, ROLES.manager]),
      validWorkspaceSlug,
    ],
    async function (request, response) {
      const { fileId = null } = request.params;
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;

        if (!fileId) return response.sendStatus(400).end();
        const { success, error, document } =
          await WorkspaceParsedFiles.moveToDocumentsAndEmbed(
            user,
            fileId,
            workspace
          );

        if (!success) {
          return response.status(500).json({
            success: false,
            error: error || "Failed to embed file",
          });
        }

        await Telemetry.sendTelemetry("document_embedded");
        await EventLogs.logEvent(
          "document_embedded",
          {
            documentName: document?.name || "unknown",
            workspaceId: workspace.id,
          },
          user?.id
        );

        return response.status(200).json({
          success: true,
          error: null,
          document,
        });
      } catch (e) {
        console.error(e.message, e);
        return response.sendStatus(500).end();
      } finally {
        // eslint-disable-next-line
        if (!fileId) return;
        await WorkspaceParsedFiles.delete({ id: parseInt(fileId) });
      }
    }
  );

  app.post(
    "/workspace/:slug/parse",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      handleFileUpload,
      validWorkspaceSlug,
    ],
    async function (request, response) {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const Collector = new CollectorApi();
        const { originalname } = request.file;
        const processingOnline = await Collector.online();

        if (!processingOnline) {
          return response.status(500).json({
            success: false,
            error: `Document processing API is not online. Document ${originalname} will not be parsed.`,
          });
        }

        const originalLocation = archiveUploadedPdfOriginal(originalname);

        const { success, reason, documents } =
          await Collector.parseDocument(originalname);
        if (!success || !documents?.[0]) {
          return response.status(500).json({
            success: false,
            error: reason || "No document returned from collector",
          });
        }

        const firstPageText = documents?.[0]?.pageContent || "";
        if (hasRestrictedContent(firstPageText)) {
          return response
            .status(403)
            .json({ success: false, error: getRestrictedMessage() });
        }

        // Get thread ID if we have a slug
        const { threadSlug = null } = reqBody(request);
        const thread = threadSlug
          ? await WorkspaceThread.get({
              slug: String(threadSlug),
              workspace_id: workspace.id,
              user_id: user?.id || null,
            })
          : null;
        const files = await Promise.all(
          documents.map(async (doc) => {
            const metadata = { ...doc };
            const pageContent = metadata.pageContent || "";
            metadata.lineCount = countContentLines(pageContent);
            metadata.isTabular = isTabularFilename(originalname);
            if (originalLocation) {
              metadata.originalLocation = originalLocation;
              metadata.originalFilename = originalname;
            }
            // Strip out pageContent
            delete metadata.pageContent;
            const filename = `${originalname}-${doc.id}.json`;
            const { file, error: dbError } = await WorkspaceParsedFiles.create({
              filename,
              workspaceId: workspace.id,
              userId: user?.id || null,
              threadId: thread?.id || null,
              metadata: JSON.stringify(metadata),
              tokenCountEstimate: doc.token_count_estimate || 0,
            });

            if (dbError) throw new Error(dbError);
            return file;
          })
        );

        Collector.log(`Document ${originalname} parsed successfully.`);
        await EventLogs.logEvent(
          "document_uploaded_to_chat",
          {
            documentName: originalname,
            workspace: workspace.slug,
            thread: thread?.name || null,
          },
          user?.id
        );

        return response.status(200).json({
          success: true,
          error: null,
          files,
        });
      } catch (e) {
        console.error(e.message, e);
        return response.sendStatus(500).end();
      }
    }
  );

  // Streaming variant of /parse: relays OCR progress (page-by-page) to the
  // client over Server-Sent Events so large scanned PDFs do not block on a
  // single long request with no feedback.
  app.post(
    "/workspace/:slug/parse-stream",
    [
      validatedRequest,
      flexUserRoleValid([ROLES.all]),
      handleFileUpload,
      validWorkspaceSlug,
    ],
    async function (request, response) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const send = (event) => writeResponseChunk(response, event);

      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const Collector = new CollectorApi();
        const { originalname } = request.file;

        const processingOnline = await Collector.online();
        if (!processingOnline) {
          send({
            type: "error",
            error: `Document processing API is not online. Document ${originalname} will not be parsed.`,
          });
          return response.end();
        }

        send({ type: "stage", stage: "uploaded", filename: originalname });

        const originalLocation = archiveUploadedPdfOriginal(originalname);

        const { success, reason, documents } =
          await Collector.parseDocumentStream(originalname, {}, (event) =>
            send(event)
          );

        if (!success || !documents?.[0]) {
          send({
            type: "error",
            error: reason || "No document returned from collector",
          });
          return response.end();
        }

        const firstPageText = documents?.[0]?.pageContent || "";
        if (hasRestrictedContent(firstPageText)) {
          send({ type: "error", error: getRestrictedMessage() });
          return response.end();
        }

        const { threadSlug = null } = reqBody(request);
        const thread = threadSlug
          ? await WorkspaceThread.get({
              slug: String(threadSlug),
              workspace_id: workspace.id,
              user_id: user?.id || null,
            })
          : null;

        const files = await Promise.all(
          documents.map(async (doc) => {
            const metadata = { ...doc };
            const pageContent = metadata.pageContent || "";
            metadata.lineCount = countContentLines(pageContent);
            metadata.isTabular = isTabularFilename(originalname);
            if (originalLocation) {
              metadata.originalLocation = originalLocation;
              metadata.originalFilename = originalname;
            }
            delete metadata.pageContent;
            const filename = `${originalname}-${doc.id}.json`;
            const { file, error: dbError } = await WorkspaceParsedFiles.create({
              filename,
              workspaceId: workspace.id,
              userId: user?.id || null,
              threadId: thread?.id || null,
              metadata: JSON.stringify(metadata),
              tokenCountEstimate: doc.token_count_estimate || 0,
            });
            if (dbError) throw new Error(dbError);
            return file;
          })
        );

        Collector.log(`Document ${originalname} parsed successfully (stream).`);
        await EventLogs.logEvent(
          "document_uploaded_to_chat",
          {
            documentName: originalname,
            workspace: workspace.slug,
            thread: thread?.name || null,
          },
          user?.id
        );

        send({ type: "complete", success: true, files });
        return response.end();
      } catch (e) {
        console.error(e.message, e);
        try {
          send({ type: "error", error: "A processing error occurred." });
        } catch (_) {
          /* response may already be closed */
        }
        return response.end();
      }
    }
  );
}

module.exports = { workspaceParsedFilesEndpoints };
