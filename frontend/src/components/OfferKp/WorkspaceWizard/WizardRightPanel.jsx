import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FilePdf, FileDoc, DownloadSimple, ArrowRight } from "@phosphor-icons/react";
import {
  SUPPORTING_DOCUMENTS,
  WORKSPACE_TEMPLATES,
} from "@/utils/offerKp/workspaceWizard";

export default function WizardRightPanel({ onUseTemplate }) {
  const { t } = useTranslation("offerKp");
  const navigate = useNavigate();

  function handleDocDownload(doc) {
    const content = `offer-kp — ${doc.name}\nSize: ${doc.size}\nGenerated: ${new Date().toLocaleDateString()}`;
    const blob = new Blob([content], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h3 className="offerKp-document-panel__eyebrow mb-3">
        {t("admin.supportingDocs")}
      </h3>
      <ul className="list-none p-0 m-0 mb-6">
        {SUPPORTING_DOCUMENTS.map((doc) => (
          <li key={doc.name} className="offerKp-doc-list-item">
            {doc.type === "pdf" ? (
              <FilePdf size={20} className="text-primary-button shrink-0" />
            ) : (
              <FileDoc size={20} className="text-primary-button shrink-0" />
            )}
            <span className="flex-1 min-w-0">
              <span className="block truncate text-theme-text-primary">{doc.name}</span>
              <span className="text-xs text-theme-text-secondary">{doc.size}</span>
            </span>
            <button type="button" onClick={() => handleDocDownload(doc)} className="border-none bg-transparent p-1 cursor-pointer text-theme-text-secondary" aria-label="Download">
              <DownloadSimple size={16} />
            </button>
          </li>
        ))}
      </ul>

      <h3 className="offerKp-document-panel__eyebrow mb-3">
        {t("admin.workspaceTemplates")}
      </h3>
      {WORKSPACE_TEMPLATES.map((tpl) => (
        <div key={tpl.id} className="offerKp-template-card">
          <p className="offerKp-template-card__title">{tpl.title}</p>
          <p className="offerKp-template-card__desc">{tpl.description}</p>
          <button
            type="button"
            className="offerKp-template-card__use"
            onClick={() => onUseTemplate?.(tpl)}
          >
            {t("admin.useTemplate")}
          </button>
        </div>
      ))}

      <button type="button" onClick={() => navigate("/settings/workspaces")} className="offerKp-suite-back mt-4 w-full justify-center">
        {t("admin.viewAllTemplates")}
        <ArrowRight size={14} />
      </button>
    </>
  );
}
