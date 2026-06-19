import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import OfferKpSuiteLayout from "@/layouts/OfferKpSuiteLayout";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import DocumentSettings from "@/components/Modals/ManageWorkspace/Documents";
import { EmbeddingProgressProvider } from "@/EmbeddingProgressContext";

export default function UserWorkspaceFilesPage() {
  const { slug } = useParams();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const ws = await Workspace.bySlug(slug);
      setWorkspace(ws);
      setLoading(false);
    }
    load();
  }, [slug]);

  return (
    <OfferKpSuiteLayout>
      <header className="offerKp-suite-page-header">
        <Link
          to={paths.settings.userWorkspaces()}
          className="offerKp-suite-back"
        >
          ← Back to User Workspaces
        </Link>
        <h1 className="offerKp-suite-page-title !mb-0">Manage files</h1>
        <p className="offerKp-field-hint !mt-2">
          {workspace?.name ? `Workspace: ${workspace.name}` : "Workspace documents"}
        </p>
      </header>
      {loading || !workspace ? (
        <div className="text-sm text-theme-text-secondary">Loading…</div>
      ) : (
        <EmbeddingProgressProvider>
          <DocumentSettings workspace={workspace} />
        </EmbeddingProgressProvider>
      )}
    </OfferKpSuiteLayout>
  );
}
