import { useState, useEffect, createContext, useContext } from "react";
import { v4 } from "uuid";
import System from "@/models/system";
import { useDropzone } from "react-dropzone";
import DndIcon from "./dnd-icon.png";
import Workspace from "@/models/workspace";
import showToast from "@/utils/toast";
import FileUploadWarningModal from "./FileUploadWarningModal";
import pluralize from "pluralize";
import { dispatchThreadFollowUps } from "@/utils/offerKp/threadFollowUpEvents";
import { UPLOAD_STARTER_FOLLOW_UP_TEXTS_RU } from "@/utils/offerKp/newChatFollowUps";

export const DndUploaderContext = createContext();
export const REMOVE_ATTACHMENT_EVENT = "ATTACHMENT_REMOVE";
export const CLEAR_ATTACHMENTS_EVENT = "ATTACHMENT_CLEAR";
export const PASTE_ATTACHMENT_EVENT = "ATTACHMENT_PASTED";
export const ATTACHMENTS_PROCESSING_EVENT = "ATTACHMENTS_PROCESSING";
export const ATTACHMENTS_PROCESSED_EVENT = "ATTACHMENTS_PROCESSED";
export const PARSED_FILE_ATTACHMENT_REMOVED_EVENT =
  "PARSED_FILE_ATTACHMENT_REMOVED";

/**
 * File Attachment for automatic upload on the chat container page.
 * @typedef Attachment
 * @property {string} uid - unique file id.
 * @property {File} file - native File object
 * @property {string|null} contentString - base64 encoded string of file
 * @property {('in_progress'|'failed'|'embedded'|'added_context')} status - the automatic upload status.
 * @property {string|null} error - Error message
 * @property {{id:string, location:string}|null} document - uploaded document details
 * @property {('attachment'|'upload')} type - The type of upload. Attachments are chat-specific, uploads go to the workspace.
 * @property {{stage?: string, pageNumber?: number, totalPages?: number}|null} [progress] - Live OCR progress for streaming uploads.
 */

/**
 * @typedef {Object} ParsedFile
 * @property {number} id - The id of the parsed file.
 * @property {string} filename - The name of the parsed file.
 * @property {number} workspaceId - The id of the workspace the parsed file belongs to.
 * @property {string|null} userId - The id of the user the parsed file belongs to.
 * @property {string|null} threadId - The id of the thread the parsed file belongs to.
 * @property {string} metadata - The metadata of the parsed file.
 * @property {number} tokenCountEstimate - The estimated token count of the parsed file.
 */

export function DnDFileUploaderProvider({
  workspace,
  threadSlug = null,
  children,
}) {
  const [files, setFiles] = useState([]);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedProgress, setEmbedProgress] = useState(0);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [tokenCount, setTokenCount] = useState(0);
  const [maxTokens, setMaxTokens] = useState(Number.POSITIVE_INFINITY);

  useEffect(() => {
    System.checkDocumentProcessorOnline().then((status) => setReady(status));
  }, []);

  // Restore thread-bound parsed files into the composer after reload / thread switch.
  useEffect(() => {
    let cancelled = false;
    async function hydrateParsedFiles() {
      if (!workspace?.slug) {
        setFiles([]);
        return;
      }
      try {
        const data = await Workspace.getParsedFiles(
          workspace.slug,
          threadSlug || null
        );
        if (cancelled) return;
        const restored = (data?.files || []).map((file) => ({
          uid: `parsed-${file.id}`,
          file: null,
          contentString: null,
          status: "added_context",
          error: null,
          document: file,
          type: "upload",
          progress: null,
        }));
        setFiles((prev) => {
          const inFlight = prev.filter(
            (f) =>
              f.status === "in_progress" ||
              (f.type === "attachment" && f.status !== "added_context")
          );
          const seen = new Set(
            restored.map((f) => f.document?.id).filter(Boolean)
          );
          const keepLocal = inFlight.filter(
            (f) => !f.document?.id || !seen.has(f.document.id)
          );
          return [...restored, ...keepLocal];
        });
      } catch {
        if (!cancelled) {
          /* keep current queue */
        }
      }
    }
    hydrateParsedFiles();
    return () => {
      cancelled = true;
    };
  }, [workspace?.slug, threadSlug]);

  useEffect(() => {
    window.addEventListener(REMOVE_ATTACHMENT_EVENT, handleRemove);
    window.addEventListener(CLEAR_ATTACHMENTS_EVENT, resetAttachments);
    window.addEventListener(PASTE_ATTACHMENT_EVENT, handlePastedAttachment);
    window.addEventListener(
      PARSED_FILE_ATTACHMENT_REMOVED_EVENT,
      handleRemoveParsedFile
    );

    return () => {
      window.removeEventListener(REMOVE_ATTACHMENT_EVENT, handleRemove);
      window.removeEventListener(CLEAR_ATTACHMENTS_EVENT, resetAttachments);
      window.removeEventListener(
        PARSED_FILE_ATTACHMENT_REMOVED_EVENT,
        handleRemoveParsedFile
      );
      window.removeEventListener(
        PASTE_ATTACHMENT_EVENT,
        handlePastedAttachment
      );
    };
  }, []);

  /**
   * Handles the removal of a parsed file attachment from the uploader queue.
   * Only uses the document id to remove the file from the queue
   * @param {CustomEvent<{document: ParsedFile}>} event
   */
  async function handleRemoveParsedFile(event) {
    const { document } = event.detail;
    setFiles((prev) =>
      prev.filter((prevFile) => prevFile.document.id !== document.id)
    );
  }

  /**
   * Remove file from uploader queue.
   * @param {CustomEvent<{uid: string}>} event
   */
  async function handleRemove(event) {
    /** @type {{uid: Attachment['uid'], document: Attachment['document']}} */
    const { uid, document } = event.detail;
    setFiles((prev) => prev.filter((prevFile) => prevFile.uid !== uid));
    if (!document?.location) return;
    await Workspace.deleteAndUnembedFile(workspace.slug, document.location);
  }

  /**
   * Clear ephemeral prompt attachments after send. Keep successfully parsed
   * thread uploads (added_context) so the inquiry file stays visible.
   */
  function resetAttachments() {
    setFiles((prev) => prev.filter((f) => f.status === "added_context"));
  }

  /**
   * Merge updates into a single queued attachment by uid.
   * @param {string} uid
   * @param {Partial<Attachment> & {progress?: object|null}} updates
   */
  function updateAttachment(uid, updates) {
    setFiles((prev) =>
      prev.map((prevFile) =>
        prevFile.uid !== uid ? prevFile : { ...prevFile, ...updates }
      )
    );
  }

  /**
   * Turns files into attachments we can send as body request to backend
   * for a chat.
   * @returns {{name:string,mime:string,contentString:string}[]}
   */
  function parseAttachments() {
    return (
      files
        ?.filter((file) => file.type === "attachment")
        ?.map(
          (
            /** @type {Attachment} */
            attachment
          ) => {
            return {
              name: attachment.file.name,
              mime: attachment.file.type,
              contentString: attachment.contentString,
            };
          }
        ) || []
    );
  }

  /**
   * Handle pasted attachments.
   * OfferKP: photos of RFQ tables must go through /parse + Vision OCR
   * (same as PDF), not as chat-only multimodal attachments — otherwise
   * ShopDB enrich runs on empty text and returns the abstain banner.
   * @param {CustomEvent<{files: File[]}>} event
   */
  async function handlePastedAttachment(event) {
    const { files = [] } = event.detail;
    if (!files.length) return;
    const newAccepted = [];
    for (const file of files) {
      newAccepted.push({
        uid: v4(),
        file,
        contentString: null,
        status: "in_progress",
        error: null,
        type: "upload",
      });
    }
    setFiles((prev) => [...prev, ...newAccepted]);
    embedEligibleAttachments(newAccepted);
  }

  /**
   * Handle dropped files.
   * Images are uploads (Vision OCR), not chat attachments — see paste handler.
   * @param {Attachment[]} acceptedFiles
   * @param {any[]} _rejections
   */
  async function onDrop(acceptedFiles, _rejections) {
    setDragging(false);

    /** @type {Attachment[]} */
    const newAccepted = [];
    for (const file of acceptedFiles) {
      newAccepted.push({
        uid: v4(),
        file,
        contentString: null,
        status: "in_progress",
        error: null,
        type: "upload",
      });
    }

    setFiles((prev) => [...prev, ...newAccepted]);
    embedEligibleAttachments(newAccepted);
  }

  /**
   * Parse uploads into thread context (PDF + RFQ photos via Vision OCR).
   * @param {Attachment[]} newAttachments
   */
  async function embedEligibleAttachments(newAttachments = []) {
    window.dispatchEvent(new CustomEvent(ATTACHMENTS_PROCESSING_EVENT));
    const promises = [];

    const { currentContextTokenCount, contextWindow } =
      await Workspace.getParsedFiles(workspace.slug, threadSlug);
    const workspaceContextWindow = contextWindow
      ? Math.floor(contextWindow * Workspace.maxContextWindowLimit)
      : Number.POSITIVE_INFINITY;
    setMaxTokens(workspaceContextWindow);

    let totalTokenCount = currentContextTokenCount;
    let batchPendingFiles = [];

    for (const attachment of newAttachments) {
      if (attachment.type === "attachment") continue;

      const formData = new FormData();
      formData.append("file", attachment.file, attachment.file.name);
      // FormData coerces null to the string "null" — only send a real slug.
      if (threadSlug) formData.append("threadSlug", threadSlug);

      // Stream OCR progress so large scanned PDFs show page-by-page status
      // instead of a single static "Uploading..." while we wait.
      promises.push(
        new Promise((resolve) => {
          Workspace.parseFileStream(workspace.slug, formData, {
            onStage: (stage) =>
              updateAttachment(attachment.uid, { progress: { stage } }),
            onPage: ({ pageNumber, totalPages }) =>
              updateAttachment(attachment.uid, {
                progress: { stage: "ocr", pageNumber, totalPages },
              }),
            onError: (error) => {
              updateAttachment(attachment.uid, {
                status: "failed",
                error: error ?? null,
                progress: null,
              });
              resolve();
            },
            onComplete: (files) => {
              /** @type {ParsedFile} */
              const file = files?.[0];
              if (!file) {
                updateAttachment(attachment.uid, {
                  status: "failed",
                  error: "No document returned.",
                  progress: null,
                });
                return resolve();
              }

              // Add token count for this file and queue it in the batch.
              totalTokenCount += file.tokenCountEstimate;
              batchPendingFiles.push({
                attachment,
                parsedFileId: file.id,
                tokenCount: file.tokenCountEstimate,
              });

              if (totalTokenCount > workspaceContextWindow) {
                setTokenCount(totalTokenCount);
                setPendingFiles(batchPendingFiles);
                setShowWarningModal(true);
                return resolve();
              }

              updateAttachment(attachment.uid, {
                status: "added_context",
                error: null,
                document: file,
                progress: null,
              });
              resolve();
            },
          });
        })
      );
    }

    // Wait for all promises to resolve in some way before dispatching the event to unlock the send button
    Promise.all(promises).finally(() => {
      window.dispatchEvent(new CustomEvent(ATTACHMENTS_PROCESSED_EVENT));
      window.dispatchEvent(new CustomEvent("offerKp:thread-files-changed"));
      if (workspace?.slug && threadSlug) {
        dispatchThreadFollowUps({
          workspaceSlug: workspace.slug,
          threadSlug,
          suggestions: UPLOAD_STARTER_FOLLOW_UP_TEXTS_RU,
          variant: "continue",
        });
      }
    });
  }

  // Handle modal actions
  const handleCloseModal = async () => {
    if (!pendingFiles.length) return;

    // Delete all files from this batch
    await Workspace.deleteParsedFiles(
      workspace.slug,
      pendingFiles.map((file) => file.parsedFileId)
    );

    // Remove all files from this batch from the UI
    setFiles((prev) =>
      prev.filter(
        (prevFile) =>
          !pendingFiles.some((file) => file.attachment.uid === prevFile.uid)
      )
    );
    setShowWarningModal(false);
    setPendingFiles([]);
    setTokenCount(0);
    window.dispatchEvent(new CustomEvent(ATTACHMENTS_PROCESSED_EVENT));
  };

  const handleContinueAnyway = async () => {
    if (!pendingFiles.length) return;
    const results = pendingFiles.map((file) => ({
      success: true,
      document: { id: file.parsedFileId },
    }));

    const fileUpdates = pendingFiles.map((file, i) => ({
      uid: file.attachment.uid,
      updates: {
        status: results[i].success ? "success" : "failed",
        error: results[i].error ?? null,
        document: results[i].document,
      },
    }));

    setFiles((prev) =>
      prev.map((prevFile) => {
        const update = fileUpdates.find((f) => f.uid === prevFile.uid);
        return update ? { ...prevFile, ...update.updates } : prevFile;
      })
    );
    setShowWarningModal(false);
    setPendingFiles([]);
    setTokenCount(0);
  };

  const handleEmbed = async () => {
    if (!pendingFiles.length) return;
    setIsEmbedding(true);
    setEmbedProgress(0);

    // Embed all pending files
    let completed = 0;
    const results = await Promise.all(
      pendingFiles.map((file) =>
        Workspace.embedParsedFile(workspace.slug, file.parsedFileId).then(
          (result) => {
            completed++;
            setEmbedProgress(completed);
            return result;
          }
        )
      )
    );

    // Update status for all files
    const fileUpdates = pendingFiles.map((file, i) => ({
      uid: file.attachment.uid,
      updates: {
        status: results[i].response.ok ? "embedded" : "failed",
        error: results[i].data?.error ?? null,
        document: results[i].data?.document,
      },
    }));

    setFiles((prev) =>
      prev.map((prevFile) => {
        const update = fileUpdates.find((f) => f.uid === prevFile.uid);
        return update ? { ...prevFile, ...update.updates } : prevFile;
      })
    );
    setShowWarningModal(false);
    setPendingFiles([]);
    setTokenCount(0);
    setIsEmbedding(false);
    window.dispatchEvent(new CustomEvent(ATTACHMENTS_PROCESSED_EVENT));
    showToast(
      `${pendingFiles.length} ${pluralize("file", pendingFiles.length)} embedded successfully`,
      "success"
    );
  };

  return (
    <DndUploaderContext.Provider
      value={{ files, ready, dragging, setDragging, onDrop, parseAttachments }}
    >
      <FileUploadWarningModal
        show={showWarningModal}
        onClose={handleCloseModal}
        onContinue={handleContinueAnyway}
        onEmbed={handleEmbed}
        tokenCount={tokenCount}
        maxTokens={maxTokens}
        fileCount={pendingFiles.length}
        isEmbedding={isEmbedding}
        embedProgress={embedProgress}
      />
      {children}
    </DndUploaderContext.Provider>
  );
}

export default function DnDFileUploaderWrapper({ children }) {
  const { onDrop, ready, dragging, setDragging } =
    useContext(DndUploaderContext);
  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    disabled: !ready,
    noClick: true,
    noKeyboard: true,
    onDragEnter: () => setDragging(true),
    onDragLeave: () => setDragging(false),
  });

  return (
    <div
      className={`relative flex flex-col h-full w-full md:mt-0 mt-[40px] p-[1px]`}
      {...getRootProps()}
    >
      <div
        hidden={!dragging}
        className="absolute top-0 w-full h-full bg-dark-text/90 light:bg-[#C2E7FE]/90 rounded-2xl border-[4px] border-white z-[9999]"
      >
        <div className="w-full h-full flex justify-center items-center rounded-xl">
          <div className="flex flex-col gap-y-[14px] justify-center items-center">
            <img
              src={DndIcon}
              width={69}
              height={69}
              alt="Drag and drop icon"
            />
            <p className="text-white text-[24px] font-semibold">Add anything</p>
            <p className="text-white text-[16px] text-center">
              Drop a file or image here to attach it to your <br />
              workspace auto-magically.
            </p>
          </div>
        </div>
      </div>
      <input id="dnd-chat-file-uploader" {...getInputProps()} />
      {children}
    </div>
  );
}
