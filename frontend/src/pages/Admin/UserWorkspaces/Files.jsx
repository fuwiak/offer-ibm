import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import LawyerRevizorroSuiteLayout from "@/layouts/LawyerRevizorroSuiteLayout";
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
    <LawyerRevizorroSuiteLayout>
      <h1 className="lawyerRevizorro-suite-page-title">Manage files</h1>
      <p className="text-sm text-theme-text-secondary mb-4">
        {workspace?.name ? `Workspace: ${workspace.name}` : "Workspace documents"}
      </p>
      <div className="mb-4">
        <Link
          to={paths.settings.userWorkspaces()}
          className="text-primary-button hover:underline text-sm"
        >
          Back to User Workspaces
        </Link>
      </div>
      {loading || !workspace ? (
        <div className="text-sm text-theme-text-secondary">Loading…</div>
      ) : (
        <EmbeddingProgressProvider>
          <DocumentSettings workspace={workspace} />
        </EmbeddingProgressProvider>
      )}
    </LawyerRevizorroSuiteLayout>
  );
}
