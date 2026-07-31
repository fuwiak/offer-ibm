import OfferKp from "@/models/offerKp";
import Workspace from "@/models/workspace";
import { downloadBlob } from "@/utils/downloadBlob";
import i18n from "@/i18n";
import showToast from "@/utils/toast";
import { INITIAL_QUOTE_DRAFT } from "@/utils/offerKp/quoteFlow";
import {
  ACTION_KIND,
  buildContextActions,
  pickLastQuoteFile,
} from "@/utils/offerKp/contextActions";
import {
  downloadFileMatchingPreview,
  downloadQuoteFileBlob,
} from "@/utils/offerKp/quoteFileDownload";
import {
  openPdfPreviewFromBlob,
  openStoredFilePreview,
} from "@/utils/offerKp/openQuoteFilePreview";
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

function draftLines(quoteDraft) {
  const lines =
    quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || [];
  return Array.isArray(lines) ? lines : [];
}

function hasLines(quoteDraft) {
  return draftLines(quoteDraft).length > 0;
}

/** Mirror QuoteDraftTable / server rejectUnconfirmedReview. */
function lineNeedsReview(line = {}) {
  const status = `${line.status || ""} ${line.kpStatus || ""}`;
  return Boolean(
    line.unitNeedsRecalc ||
      /требует|требуется|needs review/i.test(status) ||
      ["none", "size_mismatch", "spec_mismatch"].includes(line.matchType)
  );
}

function draftPayload(quoteDraft) {
  const lines = draftLines(quoteDraft);
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

function toastDownloadError(detail = "") {
  const fallback = i18n.t("quote.downloadError", {
    ns: "offerKp",
    defaultValue: "Не удалось скачать документ. Попробуйте ещё раз.",
  });
  const msg =
    detail && !/request failed|download failed|no blob/i.test(detail)
      ? detail
      : fallback;
  showToast(msg, "error");
}

/**
 * Download an already-generated КП file (no regenerate / review gate).
 */
async function downloadStoredQuoteFile(file, offerKp) {
  if (!file?.storageFilename) {
    throw new Error("No storage filename");
  }
  const filename = file.filename || file.storageFilename;
  const blob = await downloadQuoteFileBlob({
    storageFilename: file.storageFilename,
    filename,
  });
  await downloadBlob(blob, filename);
  if (/\.pdf$/i.test(filename) && typeof offerKp.setQuotePdfUrl === "function") {
    openPdfPreviewFromBlob({
      blob,
      filename,
      setQuotePdfUrl: offerKp.setQuotePdfUrl,
      setDocumentPanelOpen: offerKp.setDocumentPanelOpen,
      setDocumentPanelView: offerKp.setDocumentPanelView,
      previousPdfUrl: offerKp.quotePdfUrl?.url,
    });
  } else if (/\.docx?$/i.test(filename)) {
    offerKp.setDocPreview?.({
      filename,
      storageFilename: file.storageFilename,
      markdown: file.previewMarkdown || null,
    });
    offerKp.setDocumentPanelOpen?.(true);
    offerKp.setDocumentPanelView?.("doc");
  }
}

/**
 * Prefer stored threadQuoteFiles; else generate from quoteDraft + downloadBlob.
 */
async function downloadDraftFormat(format, offerKp, preferredFile = null) {
  const existing =
    preferredFile?.storageFilename
      ? preferredFile
      : pickLastQuoteFile(offerKp?.threadQuoteFiles, format);

  if (existing?.storageFilename) {
    await downloadStoredQuoteFile(existing, offerKp);
    return;
  }

  const quoteDraft = offerKp?.quoteDraft;
  if (!hasLines(quoteDraft)) {
    throw new Error("No quote draft lines");
  }

  const lines = draftLines(quoteDraft);
  const reviewCount = lines.filter(lineNeedsReview).length;
  if (reviewCount > 0) {
    offerKp.setDocumentPanelView?.("draftTable");
    offerKp.setDocumentPanelOpen?.(true);
    showToast(
      i18n.t("home.contextActions.downloadNeedsReview", {
        ns: "offerKp",
        count: reviewCount,
        defaultValue:
          "{{count}} поз. требуют проверки. Откройте сводку и подтвердите перед скачиванием.",
      }),
      "warning"
    );
    return;
  }

  const payload = draftPayload(quoteDraft);
  if (format === "pdf") {
    const result = await OfferKp.generateQuotePdf(payload);
    if (!result?.storageFilename) {
      throw new Error("PDF generation returned no storageFilename");
    }
    const blob = await downloadQuoteFileBlob({
      storageFilename: result.storageFilename,
      filename: result.filename,
    });
    await downloadBlob(blob, result.filename || "quote.pdf");
    if (typeof offerKp.setQuotePdfUrl === "function") {
      openPdfPreviewFromBlob({
        blob,
        filename: result.filename || "quote.pdf",
        setQuotePdfUrl: offerKp.setQuotePdfUrl,
        setDocumentPanelOpen: offerKp.setDocumentPanelOpen,
        setDocumentPanelView: offerKp.setDocumentPanelView,
        previousPdfUrl: offerKp.quotePdfUrl?.url,
      });
    }
    return;
  }

  const result = await OfferKp.generateQuoteDocx(payload);
  if (!result?.storageFilename) {
    throw new Error("DOCX generation returned no storageFilename");
  }
  const blob = await downloadQuoteFileBlob({
    storageFilename: result.storageFilename,
    filename: result.filename,
  });
  await downloadBlob(blob, result.filename || "quote.docx");
  offerKp.setDocumentPanelOpen?.(true);
  offerKp.setDocumentPanelView?.("draftTable");
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
        toastDownloadError(e?.message);
      }
      return;
    }
    case ACTION_KIND.DOWNLOAD_FILE: {
      const file = action.file;
      if (!file?.storageFilename) return;
      try {
        // Prefer stored bytes — do not regenerate (review gate / price guards).
        await downloadStoredQuoteFile(file, offerKp);
      } catch (e) {
        console.error("[runOfferKpContextAction] download:", e?.message || e);
        try {
          const { blob, filename } = await downloadFileMatchingPreview({
            storageFilename: file.storageFilename,
            filename: file.filename,
            previewMarkdown: file.previewMarkdown,
            quoteDraft: offerKp.quoteDraft,
          });
          await downloadBlob(blob, filename);
        } catch (e2) {
          console.error(
            "[runOfferKpContextAction] download fallback:",
            e2?.message || e2
          );
          toastDownloadError(e2?.message || e?.message);
        }
      }
      return;
    }
    case ACTION_KIND.DOWNLOAD_DRAFT: {
      try {
        await downloadDraftFormat(
          action.format || "pdf",
          offerKp,
          action.file || null
        );
      } catch (e) {
        console.error(
          "[runOfferKpContextAction] draft download:",
          e?.message || e
        );
        toastDownloadError(e?.message);
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
        toastDownloadError(e?.message);
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
