import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Plus } from "@phosphor-icons/react";
import Admin from "@/models/admin";
import WorkspaceRow from "./WorkspaceRow";
import OfferKpSuiteLayout from "@/layouts/OfferKpSuiteLayout";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";

export default function AdminWorkspaces() {
  const { t } = useTranslation("offerKp");

  return (
    <OfferKpSuiteLayout>
      <h1 className="offerKp-suite-page-title">{t("admin.workspacesTitle")}</h1>
      <p className="text-sm text-theme-text-secondary mb-6 max-w-2xl">
        {t("admin.workspacesSubtitle")}
      </p>
      <div className="flex justify-end mb-4">
        <Link to={paths.settings.workspacesNew()} className="offerKp-btn-new-chat no-underline">
          <Plus size={16} weight="bold" />
          {t("admin.newWorkspace")}
        </Link>
      </div>
      <div className="overflow-x-auto border border-theme-sidebar-border">
        <WorkspacesContainer />
      </div>
    </OfferKpSuiteLayout>
  );
}

function WorkspacesContainer() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);

  useEffect(() => {
    async function fetchData() {
      const _users = await Admin.users();
      const _workspaces = await Admin.workspaces();
      setUsers(_users);
      setWorkspaces(_workspaces);
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <Skeleton.default
        height="40vh"
        width="100%"
        highlightColor="var(--theme-bg-primary)"
        baseColor="var(--theme-bg-secondary)"
        count={1}
      />
    );
  }

  return (
    <table className="w-full text-sm text-left min-w-[640px]">
      <thead className="text-theme-text-secondary text-xs font-semibold uppercase border-b border-theme-sidebar-border bg-theme-bg-chat-input">
        <tr>
          <th scope="col" className="px-6 py-3">
            Name
          </th>
          <th scope="col" className="px-6 py-3">
            Link
          </th>
          <th scope="col" className="px-6 py-3">
            Users
          </th>
          <th scope="col" className="px-6 py-3">
            Created On
          </th>
          <th scope="col" className="px-6 py-3" />
        </tr>
      </thead>
      <tbody>
        {workspaces.map((workspace) => (
          <WorkspaceRow
            key={workspace.id}
            workspace={workspace}
            users={users}
          />
        ))}
      </tbody>
    </table>
  );
}
