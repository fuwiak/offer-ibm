import { saveAs } from "file-saver";
import OfferKp from "@/models/offerKp";
import Workspace from "@/models/workspace";
import { downloadBlob } from "@/utils/downloadBlob";
import { INITIAL_QUOTE_DRAFT } from "@/utils/offerKp/quoteFlow";
import {
  ACTION_KIND,
  buildContextActions,
} from "@/utils/offerKp/contextActions";
import {
  downloadFileMatchingPreview,
  downloadQuoteFileBlob,
} from "@/utils/offerKp/quoteFileDownload";
import { openStoredFilePreview } from "@/utils/offerKp/openQuoteFilePreview";
import {
  openUploadedFilePreview,
} from "@/utils/offerKp/openUploadedPdfPreview";
import paths from "@/utils/paths";

export function openQuoteBuilder(ctx) {
  const {
    setDocumentPanelOpen,
    setDocumentPanelView,
    setActiveDocumentTab,
    setQuoteDraft,
  } = ctx;
  setDocumentPanelOpen(true);
  setDocumentPanelView("builder");
  setActiveDocumentTab("quote");
  setQuoteDraft(INITIAL_QUOTE_DRAFT);
}

/** Dispatched from home quick actions to open the SAV modal. */
export const OFFER_KP_OPEN_SAV_EVENT = "offerKp:open-sav";

/**
 * Real OfferKP starter prompts (empty home / URL intent launcher).
 * Keep create_quote phrasing compatible with intentRouter START_QUOTE_PROMPTS.
 */
export const HOME_CHAT_PROMPTS = {
  findByDin: "Найди в каталоге ShopDB: болт DIN 933 М8×40",
  findBySku: "Найди товар по артикулу в каталоге purolat.com",
  makeQuote: "Сделай КП по прикреплённой заявке",
  findAnalogs:
    "Подбери аналоги DIN/ГОСТ для позиций, которых нет в наличии",
  checkStock: "Проверь наличие и цены по заявке перед формированием КП",
  parseInquiry:
    "Разбери прикреплённую заявку и извлеки позиции крепежа для КП",
  draftFromList:
    "Сформируй черновик КП по списку позиций из каталога purolat.com",
  exportQuoteDoc:
    "Подготовь КП в PDF/DOCX с таблицей позиций, ценами и статусами",
  technical: "Найди в каталоге ShopDB: болт DIN 933 М8×40",
};

function draftPayload(quoteDraft) {
  const lines =
    quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || [];
  const preview = quoteDraft?.preview || {};
  return {
    reference: quoteDraft?.reference,
    customer: {
      name: quoteDraft?.customer?.name || "",
      country: quoteDraft?.customer?.country || "",
    },
    priceMode: quoteDraft?.priceMode || "public",
    lines,
    shipping: preview.shipping ?? quoteDraft?.shipping ?? 0,
    subtotal: preview.subtotal,
    total: preview.total ?? preview.subtotal,
    createdAt: new Date(),
    doc: quoteDraft?.doc,
  };
}

async function downloadDraftFormat(format, offerKp) {
  const quoteDraft = offerKp?.quoteDraft;
  if (!hasLines(quoteDraft)) {
    throw new Error("No quote draft lines");
  }
  const payload = draftPayload(quoteDraft);
  if (format === "pdf") {
    const result = await OfferKp.generateQuotePdf(payload);
    const blob = await downloadQuoteFileBlob({
      storageFilename: result.storageFilename,
      filename: result.filename,
    });
    await openStoredFilePreview({
      filename: result.filename,
      storageFilename: result.storageFilename,
      setQuotePdfUrl: offerKp.setQuotePdfUrl,
      setDocumentPanelOpen: offerKp.setDocumentPanelOpen,
      setDocumentPanelView: offerKp.setDocumentPanelView,
      setDocPreview: offerKp.setDocPreview,
      previousPdfUrl: offerKp.quotePdfUrl?.url,
    });
    saveAs(blob, result.filename || "quote.pdf");
    return;
  }
  const result = await OfferKp.generateQuoteDocx(payload);
  const blob = await downloadQuoteFileBlob({
    storageFilename: result.storageFilename,
    filename: result.filename,
  });
  await downloadBlob(blob, result.filename || "quote.docx");
  offerKp.setDocumentPanelOpen?.(true);
  if (hasLines(quoteDraft)) {
    offerKp.setDocumentPanelView?.("draftTable");
  }
}

function hasLines(quoteDraft) {
  const lines =
    quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || [];
  return Array.isArray(lines) && lines.length > 0;
}

/**
 * Execute a grounded context action (panel / file / real command).
 * @param {object} action from buildContextActions
 * @param {object} ctx
 */
export async function runOfferKpContextAction(action, ctx = {}) {
  if (!action?.kind) return;

  const {
    navigate,
    sendCommand,
    offerKp = {},
    workspaceSlug = null,
    threadSlug = null,
  } = ctx;

  switch (action.kind) {
    case ACTION_KIND.UPLOAD: {
      document.getElementById("dnd-chat-file-uploader")?.click();
      return;
    }
    case ACTION_KIND.COMMAND: {
      const text = String(action.text || "").trim();
      if (!text) return;
      if (sendCommand) {
        sendCommand({ text, writeMode: "replace", autoSubmit: true });
        return;
      }
      if (navigate) {
        navigate(paths.offerKp.chat({ message: text }));
      }
      return;
    }
    case ACTION_KIND.PANEL: {
      if (action.openSidebar) {
        offerKp.setUploadedPdfSidebarOpen?.(true);
      }
      if (action.view) {
        offerKp.setDocumentPanelView?.(action.view);
      }
      offerKp.setDocumentPanelOpen?.(true);
      return;
    }
    case ACTION_KIND.PREVIEW_FILE: {
      const file = action.file;
      if (!file?.storageFilename) return;
      try {
        await openStoredFilePreview({
          filename: file.filename,
          storageFilename: file.storageFilename,
          previewMarkdown: file.previewMarkdown,
          setQuotePdfUrl: offerKp.setQuotePdfUrl,
          setDocumentPanelOpen: offerKp.setDocumentPanelOpen,
          setDocumentPanelView: offerKp.setDocumentPanelView,
          setDocPreview: offerKp.setDocPreview,
          previousPdfUrl: offerKp.quotePdfUrl?.url,
        });
      } catch (e) {
        console.error("[runOfferKpContextAction] preview:", e?.message || e);
      }
      return;
    }
    case ACTION_KIND.DOWNLOAD_FILE: {
      const file = action.file;
      if (!file?.storageFilename) return;
      try {
        const { blob, filename } = await downloadFileMatchingPreview({
          storageFilename: file.storageFilename,
          filename: file.filename,
          previewMarkdown: file.previewMarkdown,
          quoteDraft: offerKp.quoteDraft,
        });
        await downloadBlob(blob, filename);
      } catch (e) {
        console.error("[runOfferKpContextAction] download:", e?.message || e);
      }
      return;
    }
    case ACTION_KIND.DOWNLOAD_DRAFT: {
      try {
        await downloadDraftFormat(action.format || "pdf", offerKp);
      } catch (e) {
        console.error(
          "[runOfferKpContextAction] draft download:",
          e?.message || e
        );
      }
      return;
    }
    case ACTION_KIND.OPEN_UPLOADED: {
      const file = action.file;
      const ws = workspaceSlug || offerKp.activeWorkspaceSlug;
      const ts = threadSlug || offerKp.activeThreadSlug;
      if (!file?.id || !ws) return;
      try {
        await openUploadedFilePreview({
          workspaceSlug: ws,
          threadSlug: ts,
          file: {
            id: file.id,
            filename: file.filename,
            title: file.filename,
            isPdf: file.isPdf,
            hasOriginalPdf: file.hasOriginalPdf,
          },
          setUploadedPdfPreview: offerKp.setUploadedPdfPreview,
          setUploadedPdfSidebarOpen: offerKp.setUploadedPdfSidebarOpen,
          previousUrl: offerKp.uploadedPdfPreview?.url,
          fetchTextPreview: async () => {
            const result = await Workspace.getParsedFilePreview(ws, file.id, {
              threadSlug: ts,
              limit: 80,
              offset: 0,
            });
            return result?.preview || null;
          },
        });
        offerKp.setDocumentPanelOpen?.(true);
      } catch (e) {
        console.error(
          "[runOfferKpContextAction] open uploaded:",
          e?.message || e
        );
      }
      return;
    }
    default:
      break;
  }
}

/**
 * @param {string} key legacy quick-action / URL intent key
 * @param {{ navigate?: Function, sendCommand?: Function, offerKp?: object }} [opts]
 */
export function handleOfferKpQuickActionKey(
  key,
  { navigate, sendCommand, offerKp } = {}
) {
  if (key === "dashboard" && navigate) {
    navigate(paths.offerKp.dashboard());
    return;
  }

  if (key === "uploadInquiry") {
    document.getElementById("dnd-chat-file-uploader")?.click();
    return;
  }

  const prompt = HOME_CHAT_PROMPTS[key];
  if (prompt) {
    if (sendCommand) {
      sendCommand({ text: prompt, writeMode: "replace", autoSubmit: true });
      return;
    }
    if (navigate) {
      navigate(paths.offerKp.chat({ intent: key }));
      return;
    }
  }

  // Fall back: treat unknown keys as empty-home context action ids.
  const actions = buildContextActions({
    quoteDraft: offerKp?.quoteDraft,
    threadQuoteFiles: offerKp?.threadQuoteFiles,
    uploadedPdfPreview: offerKp?.uploadedPdfPreview,
    t: (k) => k,
  });
  const match = actions.find((a) => a.id === key);
  if (match) {
    void runOfferKpContextAction(match, { navigate, sendCommand, offerKp });
    return;
  }

  if (navigate) navigate(paths.offerKp.home());
}

export function getHomeActionRoute(key) {
  switch (key) {
    case "dashboard":
      return paths.offerKp.dashboard();
    default:
      if (HOME_CHAT_PROMPTS[key]) {
        return paths.offerKp.chat({ intent: key });
      }
      return paths.offerKp.home();
  }
}
