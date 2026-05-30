import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Admin from "@/models/admin";
import showToast from "@/utils/toast";
export default function AccountAdminPanel() {
  const { t } = useTranslation("lawyerRevizorro");
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspaceMemberIds, setWorkspaceMemberIds] = useState([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ws, us] = await Promise.all([Admin.workspaces(), Admin.users()]);
      setWorkspaces(ws);
      setUsers(us);
      setSelectedWorkspaceId((prev) => {
        if (prev && ws.some((w) => String(w.id) === prev)) return prev;
        return ws[0]?.id ? String(ws[0].id) : "";
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setWorkspaceMemberIds([]);
      return;
    }
    const ws = workspaces.find((w) => String(w.id) === String(selectedWorkspaceId));
    setWorkspaceMemberIds(ws?.userIds?.map(Number) ?? []);
  }, [selectedWorkspaceId, workspaces]);

  async function handleCreateWorkspace(e) {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    setBusy(true);
    const { workspace, error } = await Admin.newWorkspace(newWorkspaceName.trim());
    setBusy(false);
    if (error || !workspace) {
      showToast(error || t("account.workspaceCreateFailed"), "error");
      return;
    }
    showToast(t("account.workspaceCreated"), "success");
    setNewWorkspaceName("");
    await loadData();
    setSelectedWorkspaceId(String(workspace.id));
  }

  async function handleDeleteWorkspace(ws) {
    if (!window.confirm(t("account.workspaceDeleteConfirm", { name: ws.name }))) return;
    setBusy(true);
    await Admin.deleteWorkspace(ws.id);
    setBusy(false);
    showToast(t("account.workspaceDeleted"), "success");
    setSelectedWorkspaceId("");
    await loadData();
  }

  async function handleSaveWorkspaceMembers(e) {
    e.preventDefault();
    if (!selectedWorkspaceId) return;
    setBusy(true);
    const { success, error } = await Admin.updateUsersInWorkspace(
      Number(selectedWorkspaceId),
      workspaceMemberIds
    );
    setBusy(false);
    if (!success) {
      showToast(error || t("account.workspaceMembersFailed"), "error");
      return;
    }
    showToast(t("account.workspaceMembersSaved"), "success");
    await loadData();
  }

  function toggleMember(userId) {
    setWorkspaceMemberIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  const assignableUsers = users;

  if (loading) {
    return (
      <p className="text-sm text-theme-text-secondary">{t("account.loadingAdmin")}</p>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <section className="border border-theme-sidebar-border bg-theme-bg-primary p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-text-primary">
          {t("account.workspacesTitle")}
        </h2>
        <form onSubmit={handleCreateWorkspace} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder={t("account.workspaceNamePlaceholder")}
            className="lawyerRevizorro-carbon-input flex-1 min-w-[200px]"
            disabled={busy}
          />
          <button type="submit" className="lawyerRevizorro-btn-new-chat w-auto" disabled={busy}>
            {t("account.addWorkspace")}
          </button>
        </form>
        <ul className="divide-y divide-theme-sidebar-border text-sm">
          {workspaces.length === 0 ? (
            <li className="py-2 text-theme-text-secondary">{t("account.noWorkspaces")}</li>
          ) : (
            workspaces.map((ws) => (
              <li
                key={ws.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <button
                  type="button"
                  className={`text-left flex-1 ${
                    String(ws.id) === selectedWorkspaceId
                      ? "text-primary-button font-medium"
                      : "text-theme-text-primary"
                  }`}
                  onClick={() => setSelectedWorkspaceId(String(ws.id))}
                >
                  {ws.name}{" "}
                  <span className="text-theme-text-secondary text-xs">({ws.slug})</span>
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  disabled={busy}
                  onClick={() => handleDeleteWorkspace(ws)}
                >
                  {t("account.removeWorkspace")}
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      {selectedWorkspaceId && (
        <section className="border border-theme-sidebar-border bg-theme-bg-primary p-6 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-text-primary">
            {t("account.workspaceMembersTitle")}
          </h2>
          <form onSubmit={handleSaveWorkspaceMembers} className="space-y-3">
            <div className="max-h-48 overflow-y-auto space-y-2">
              {assignableUsers.length === 0 ? (
                <p className="text-xs text-theme-text-secondary">
                  {t("account.noAssignableUsers")}
                </p>
              ) : (
                assignableUsers.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 text-sm text-theme-text-primary cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={workspaceMemberIds.includes(u.id)}
                      onChange={() => toggleMember(u.id)}
                    />
                    {u.username || `user #${u.id}`}
                    <span className="text-theme-text-secondary text-xs capitalize">
                      {u.role}
                    </span>
                  </label>
                ))
              )}
            </div>
            <button type="submit" className="lawyerRevizorro-btn-new-chat w-auto" disabled={busy}>
              {t("account.saveWorkspaceMembers")}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
