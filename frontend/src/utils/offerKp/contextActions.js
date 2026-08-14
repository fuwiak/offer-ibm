/** Max chips shown in home / empty-thread / follow-up strips. */
export const MAX_CONTEXT_ACTIONS = 6;

export const ACTION_KIND = Object.freeze({
  PANEL: "panel",
  COMMAND: "command",
  UPLOAD: "upload",
  PREVIEW_FILE: "previewFile",
  DOWNLOAD_FILE: "downloadFile",
  DOWNLOAD_DRAFT: "downloadDraft",
  OPEN_UPLOADED: "openUploaded",
});

/**
 * @param {string} name
 * @param {number} [max]
 */
export function shortFilename(name = "", max = 28) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (raw.length <= max) return raw;
  const extMatch = raw.match(/(\.[a-z0-9]{1,8})$/i);
  const ext = extMatch ? extMatch[1] : "";
  const base = ext ? raw.slice(0, -ext.length) : raw;
  const keep = Math.max(8, max - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

function isPdfName(name = "") {
  return /\.pdf$/i.test(String(name));
}

function isDocxName(name = "") {
  return /\.docx?$/i.test(String(name));
}

/**
 * @param {object|null} quoteDraft
 */
export function hasQuoteDraftLines(quoteDraft = null) {
  const lines = quoteDraft?.hardwareLines || quoteDraft?.preview?.lines || [];
  return Array.isArray(lines) && lines.length > 0;
}

/**
 * @param {object[]} [attachments] DnD attachment queue
 */
export function pickPrimaryAttachment(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  const ready = list.filter(
    (a) =>
      a?.status === "added_context" ||
      a?.status === "embedded" ||
      a?.document?.id
  );
  const pool = ready.length ? ready : list;
  const withDoc = pool.find((a) => a?.document?.id) || pool[0] || null;
  if (!withDoc) return null;
  const doc = withDoc.document || null;
  const filename = doc?.filename || doc?.title || withDoc.file?.name || null;
  if (!filename && !doc?.id) return null;
  return {
    id: doc?.id || null,
    filename: filename || "заявка",
    isPdf:
      doc?.isPdf === true || isPdfName(filename || "") || !!doc?.hasOriginalPdf,
    hasOriginalPdf: !!doc?.hasOriginalPdf || isPdfName(filename || ""),
    document: doc,
  };
}

/**
 * @param {object[]} files
 * @param {"pdf"|"docx"} kind
 */
export function pickLastQuoteFile(files = [], kind) {
  const list = Array.isArray(files) ? files : [];
  const match = [...list].reverse().find((f) => {
    const name = f?.filename || f?.storageFilename || "";
    if (kind === "pdf") {
      return f?.kind === "pdf" || isPdfName(name);
    }
    if (kind === "docx") {
      return f?.kind === "docx" || isDocxName(name);
    }
    return false;
  });
  return match || null;
}

function action(partial) {
  return {
    icon: partial.id,
    ...partial,
  };
}

/**
 * Build grounded OfferKP chips from live thread / home state.
 * Prefer panel / file actions over fake CRM prompts.
 *
 * @param {object} opts
 * @param {object|null} [opts.quoteDraft]
 * @param {object[]} [opts.threadQuoteFiles]
 * @param {object|null} [opts.uploadedPdfPreview]
 * @param {object[]} [opts.attachments]
 * @param {(key: string, opts?: object) => string} opts.t i18n `t` bound to offerKp
 * @param {number} [opts.max]
 */
export function buildContextActions({
  quoteDraft = null,
  threadQuoteFiles = [],
  uploadedPdfPreview = null,
  attachments = [],
  t,
  max = MAX_CONTEXT_ACTIONS,
} = {}) {
  if (typeof t !== "function") return [];

  const actions = [];
  const seen = new Set();
  const push = (item) => {
    if (!item?.id || seen.has(item.id) || actions.length >= max) return;
    seen.add(item.id);
    actions.push(action(item));
  };

  const lastPdf = pickLastQuoteFile(threadQuoteFiles, "pdf");
  const lastDocx = pickLastQuoteFile(threadQuoteFiles, "docx");
  const hasDraft = hasQuoteDraftLines(quoteDraft);
  const hasPreview = !!quoteDraft?.preview;
  const attachment = pickPrimaryAttachment(attachments);
  const uploadedName =
    uploadedPdfPreview?.filename || attachment?.filename || null;
  const uploadedShort = shortFilename(uploadedName);

  // Draft panel + download first (max:4 strips otherwise drop downloads
  // when showLast* consume the first slots).
  if (hasDraft) {
    push({
      id: "openDraftTable",
      kind: ACTION_KIND.PANEL,
      view: "draftTable",
      label: t("home.contextActions.openDraftTable"),
    });
    if (hasPreview) {
      push({
        id: "openQuotePreview",
        kind: ACTION_KIND.PANEL,
        view: "quotePreview",
        label: t("home.contextActions.openQuotePreview"),
      });
    }
    push({
      id: "downloadDraftPdf",
      kind: ACTION_KIND.DOWNLOAD_DRAFT,
      format: "pdf",
      file: lastPdf || null,
      label: t("home.contextActions.downloadPdf"),
    });
    push({
      id: "downloadDraftDocx",
      kind: ACTION_KIND.DOWNLOAD_DRAFT,
      format: "docx",
      file: lastDocx || null,
      label: t("home.contextActions.downloadDocx"),
    });
  } else {
    // No draft: still offer download of already-generated КП files.
    if (lastPdf) {
      push({
        id: "downloadDraftPdf",
        kind: ACTION_KIND.DOWNLOAD_DRAFT,
        format: "pdf",
        file: lastPdf,
        label: t("home.contextActions.downloadPdf"),
      });
    }
    if (lastDocx) {
      push({
        id: "downloadDraftDocx",
        kind: ACTION_KIND.DOWNLOAD_DRAFT,
        format: "docx",
        file: lastDocx,
        label: t("home.contextActions.downloadDocx"),
      });
    }
  }

  if (lastPdf) {
    push({
      id: "showLastPdf",
      kind: ACTION_KIND.PREVIEW_FILE,
      file: lastPdf,
      label: t("home.contextActions.showLastPdf"),
    });
  }

  if (lastDocx) {
    push({
      id: "showLastDocx",
      kind: ACTION_KIND.PREVIEW_FILE,
      file: lastDocx,
      label: t("home.contextActions.showLastDocx"),
    });
  }

  if (uploadedShort || attachment) {
    const name = uploadedShort || shortFilename(attachment.filename);
    push({
      id: "makeQuoteFromFile",
      kind: ACTION_KIND.COMMAND,
      text: t("home.contextActions.makeQuoteFromFileCommand", {
        filename: name,
      }),
      label: t("home.contextActions.makeQuoteFromFile", { filename: name }),
    });
    push({
      id: "showInquiryText",
      kind: ACTION_KIND.COMMAND,
      text: t("home.contextActions.showInquiryTextCommand", {
        filename: name,
      }),
      label: t("home.contextActions.showInquiryText"),
    });
    if (attachment?.id && (attachment.isPdf || attachment.hasOriginalPdf)) {
      push({
        id: "openUploadedPdf",
        kind: ACTION_KIND.OPEN_UPLOADED,
        file: attachment,
        label: t("home.contextActions.openUploadedPdf"),
      });
    } else if (uploadedPdfPreview) {
      push({
        id: "focusUploadedPdf",
        kind: ACTION_KIND.PANEL,
        view: "docs",
        openSidebar: true,
        label: t("home.contextActions.openUploadedPdf"),
      });
    }
  }

  const hasContext =
    !!lastPdf || !!lastDocx || hasDraft || !!uploadedShort || !!attachment;

  if (!hasContext) {
    push({
      id: "uploadInquiry",
      kind: ACTION_KIND.UPLOAD,
      label: t("home.contextActions.uploadInquiry"),
    });
    push({
      id: "findByDin",
      kind: ACTION_KIND.COMMAND,
      text: t("home.contextActions.findByDinCommand"),
      label: t("home.contextActions.findByDin"),
    });
    push({
      id: "findBySku",
      kind: ACTION_KIND.COMMAND,
      text: t("home.contextActions.findBySkuCommand"),
      label: t("home.contextActions.findBySku"),
    });
    push({
      id: "makeQuote",
      kind: ACTION_KIND.COMMAND,
      text: t("home.contextActions.makeQuoteCommand"),
      label: t("home.contextActions.makeQuote"),
      // Prefill only — operator attaches the RFQ file, then sends.
      autoSubmit: false,
    });
    push({
      id: "findAnalogs",
      kind: ACTION_KIND.COMMAND,
      text: t("home.contextActions.findAnalogsCommand"),
      label: t("home.contextActions.findAnalogs"),
    });
  }

  return actions.slice(0, max);
}

/**
 * Deterministic upload chips (RU) — keep intentRouter-compatible create_quote phrasing.
 * @param {string} [filename]
 */
export function buildUploadStarterFollowUpTexts(filename = "") {
  const short = shortFilename(filename);
  if (short) {
    return [
      `Сформировать КП по ${short}`,
      "Покажи текст заявки из загруженного файла",
      "Покажи сводку позиций из загруженного файла",
    ];
  }
  return [
    "Сделай КП по прикреплённой заявке",
    "Покажи сводку позиций из загруженного файла",
    "Найди аналоги для позиций без наличия",
  ];
}
