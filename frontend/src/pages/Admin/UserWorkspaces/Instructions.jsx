import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OfferKpSuiteLayout from "@/layouts/OfferKpSuiteLayout";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";

export default function UserWorkspaceInstructionsPage() {
  const { slug } = useParams();
  const { t } = useTranslation("offerKp");
  const [workspace, setWorkspace] = useState(null);
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const ws = await Workspace.bySlug(slug);
      setWorkspace(ws);
      setInstructions(ws?.openAiPrompt || "");
      setLoading(false);
    }
    load();
  }, [slug]);

  async function saveInstructions(e) {
    e.preventDefault();
    if (!workspace?.slug) return;
    setSaving(true);
    const { workspace: updated, message } = await Workspace.update(workspace.slug, {
      openAiPrompt: instructions,
    });
    setSaving(false);
    if (!updated) {
      showToast(message || "Failed to update instructions.", "error");
      return;
    }
    showToast("Instructions updated.", "success");
  }

  return (
    <OfferKpSuiteLayout>
      <header className="offerKp-suite-page-header">
        <Link
          to={paths.settings.userWorkspaces()}
          className="offerKp-suite-back"
        >
          ← {t("admin.backToUserWorkspaces", { defaultValue: "Back to User Workspaces" })}
        </Link>
        <h1 className="offerKp-suite-page-title !mb-0">Edit instructions</h1>
        <p className="offerKp-field-hint !mt-2">
          {workspace?.name ? `Workspace: ${workspace.name}` : "Workspace instructions"}
        </p>
      </header>
      {loading ? (
        <div className="text-sm text-theme-text-secondary">Loading…</div>
      ) : (
        <form onSubmit={saveInstructions} className="max-w-4xl">
          <textarea
            className="offerKp-carbon-textarea w-full min-h-[360px]"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Write workspace instructions..."
          />
          <button
            type="submit"
            className="offerKp-btn-new-chat w-auto mt-4"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save instructions"}
          </button>
        </form>
      )}
    </OfferKpSuiteLayout>
  );
}
