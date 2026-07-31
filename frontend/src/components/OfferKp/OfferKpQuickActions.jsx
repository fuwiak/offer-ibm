import {
  Article,
  Eye,
  FileDoc,
  FilePdf,
  FileText,
  MagnifyingGlass,
  Table,
  UploadSimple,
} from "@phosphor-icons/react";
import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DndUploaderContext } from "@/components/WorkspaceChat/ChatContainer/DnDWrapper";
import { useOfferKp } from "@/contexts/OfferKpContext";
import { buildContextActions } from "@/utils/offerKp/contextActions";
import { runOfferKpContextAction } from "@/utils/offerKp/homeActions";

const ICONS = {
  uploadInquiry: UploadSimple,
  findByDin: MagnifyingGlass,
  findBySku: MagnifyingGlass,
  makeQuote: FileText,
  makeQuoteFromFile: FileText,
  findAnalogs: MagnifyingGlass,
  showInquiryText: Article,
  openUploadedPdf: FilePdf,
  focusUploadedPdf: FilePdf,
  openDraftTable: Table,
  openQuotePreview: Eye,
  downloadDraftPdf: FilePdf,
  downloadDraftDocx: FileDoc,
  showLastPdf: FilePdf,
  showLastDocx: FileDoc,
};

/**
 * Context-aware OfferKP action grid — grounded in draft / files / uploads.
 */
export default function OfferKpQuickActions({
  onAction,
  sendCommand,
  navigate,
}) {
  const { t } = useTranslation("offerKp");
  const offerKp = useOfferKp();
  const dnd = useContext(DndUploaderContext);
  const attachments = dnd?.files || [];

  const actions = useMemo(
    () =>
      buildContextActions({
        quoteDraft: offerKp.quoteDraft,
        threadQuoteFiles: offerKp.threadQuoteFiles,
        uploadedPdfPreview: offerKp.uploadedPdfPreview,
        attachments,
        t,
      }),
    [
      offerKp.quoteDraft,
      offerKp.threadQuoteFiles,
      offerKp.uploadedPdfPreview,
      attachments,
      t,
    ]
  );

  async function handleClick(action) {
    if (onAction) {
      onAction(action);
      return;
    }
    await runOfferKpContextAction(action, {
      navigate,
      sendCommand,
      offerKp,
      workspaceSlug: offerKp.activeWorkspaceSlug,
      threadSlug: offerKp.activeThreadSlug,
    });
  }

  if (!actions.length) return null;

  return (
    <section className="offerKp-quick-grid" aria-label="Quick actions">
      {actions.map((action) => {
        const Icon = ICONS[action.id] || FileText;
        return (
          <button
            key={action.id}
            type="button"
            className="offerKp-quick-card"
            onClick={() => handleClick(action)}
          >
            <Icon
              size={24}
              weight="light"
              className="offerKp-quick-card__icon"
            />
            <span className="offerKp-quick-card__label">{action.label}</span>
          </button>
        );
      })}
    </section>
  );
}
