import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import OfferKpSuiteLayout from "@/layouts/OfferKpSuiteLayout";
import paths from "@/utils/paths";
import Admin from "@/models/admin";
import Workspace from "@/models/workspace";
import showToast from "@/utils/toast";
import {
  filterWorkspacesForViewer,
  getUserWorkspaceBasePrompt,
  getUserWorkspaceProfile,
  isAdminWorkspace,
  USER_WORKSPACE_PROFILES,
} from "@/utils/offerKp/userWorkspaceProfiles";
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@/utils/username";
import { AUTH_TOKEN } from "@/utils/constants";
import useUser from "@/hooks/useUser";

const STEPS = [
  { n: 1, label: "Name" },
  { n: 2, label: "Profile type" },
  { n: 3, label: "Base instructions" },
  { n: 4, label: "Custom instructions" },
  { n: 5, label: "Review & create" },
];

function workspaceInitials(name) {
  const parts = `${name || ""}`.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  return (parts[0] || "WS").slice(0, 2).toUpperCase();
}

export default function UserWorkspacesPage() {
  const { t } = useTranslation("offerKp");
  const { user: sessionUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [step, setStep] = useState(1);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showAssignUsers, setShowAssignUsers] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [accountDraft, setAccountDraft] = useState({
    username: "",
    password: "",
    role: "default",
  });
  const [draft, setDraft] = useState({
    name: "",
    profileId: "partner",
    baseInstructions: getUserWorkspaceBasePrompt("partner"),
    customInstructions: "",
  });

  async function loadData() {
    setLoading(true);
    try {
      const [ws, us] = await Promise.all([Admin.workspaces(), Admin.users()]);
      setWorkspaces(ws || []);
      setUsers(us || []);
    } finally {
      setLoading(false);
    }
  }

  const isAdmin = sessionUser?.role === "admin";
  const isManager = sessionUser?.role === "manager";
  const canLoadData =
    (isAdmin || isManager) && !!window.localStorage.getItem(AUTH_TOKEN);

  useEffect(() => {
    if (!canLoadData) {
      setLoading(false);
      return;
    }
    loadData();
  }, [canLoadData]);

  function canDeleteWorkspace(ws) {
    if (isAdmin) return true;
    if (isManager) return Number(ws?.createdBy) === Number(sessionUser?.id);
    return false;
  }

  const usersById = useMemo(() => {
    return new Map(users.map((u) => [u.id, u]));
  }, [users]);

  const rows = useMemo(() => {
    const visible = filterWorkspacesForViewer(workspaces, sessionUser?.role);
    return visible
      .filter((ws) => isAdmin || !isAdminWorkspace(ws))
      .map((ws) => {
        const profile = getUserWorkspaceProfile(
          ws.offerKpUserProfile || "partner"
        );
        return { ws, profile };
      });
  }, [workspaces, sessionUser?.role, isAdmin]);

  const memberUserIds = useMemo(
    () => new Set(workspaceMembers.map((m) => m.userId)),
    [workspaceMembers]
  );

  const assignableUsers = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return users
      .filter((u) => !memberUserIds.has(u.id))
      .filter((u) => {
        if (!q) return true;
        const label = `${u.username || ""} ${u.role || ""} #${u.id}`.toLowerCase();
        return label.includes(q);
      });
  }, [users, memberUserIds, assignSearch]);

  const selectedRow = useMemo(() => {
    if (!selectedId) return rows[0] || null;
    return rows.find((r) => r.ws.id === selectedId) || rows[0] || null;
  }, [rows, selectedId]);

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !rows.some((r) => r.ws.id === selectedId)) {
      setSelectedId(rows[0].ws.id);
    }
  }, [rows, selectedId]);

  async function loadWorkspaceMembers(workspaceId) {
    if (!workspaceId) {
      setWorkspaceMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      const members = await Admin.workspaceUsers(workspaceId);
      setWorkspaceMembers(members || []);
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    if (!canLoadData) {
      setWorkspaceMembers([]);
      return;
    }
    loadWorkspaceMembers(selectedRow?.ws?.id);
    setShowAssignUsers(false);
    setAssignSearch("");
  }, [selectedRow?.ws?.id, canLoadData]);

  function updateDraft(patch) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function onProfileChange(profileId) {
    updateDraft({
      profileId,
      baseInstructions: getUserWorkspaceBasePrompt(profileId),
    });
  }

  async function suspendMemberInWorkspace(member) {
    if (!selectedRow?.ws || !member) return;
    const suspended = member.suspended === 1;
    if (
      !window.confirm(
        suspended
          ? `Unsuspend ${member.username} in "${selectedRow.ws.name}"?`
          : `Suspend ${member.username} in "${selectedRow.ws.name}"? They lose access to this workspace only.`
      )
    )
      return;

    setBusy(true);
    try {
      const { success, error, users } = await Admin.updateWorkspaceMembership(
        selectedRow.ws.id,
        member.userId,
        { suspended: !suspended }
      );
      if (!success) {
        showToast(error || "Failed to update membership.", "error");
        return;
      }
      setWorkspaceMembers(users || []);
      showToast(
        suspended ? "User unsuspended in workspace." : "User suspended in workspace.",
        "success"
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeMemberFromWorkspace(member) {
    if (!selectedRow?.ws || !member) return;
    if (
      !window.confirm(
        `Remove ${member.username} from "${selectedRow.ws.name}"? Their account stays active in other workspaces.`
      )
    )
      return;

    setBusy(true);
    try {
      const { success, error, users } = await Admin.removeUserFromWorkspace(
        selectedRow.ws.id,
        member.userId
      );
      if (!success) {
        showToast(error || "Failed to remove user.", "error");
        return;
      }
      setWorkspaceMembers(users || []);
      await loadData();
      showToast("User removed from workspace.", "success");
    } finally {
      setBusy(false);
    }
  }

  async function assignUserToWorkspace(userId) {
    if (!selectedRow?.ws) return;
    setBusy(true);
    try {
      const { success, error, users } = await Admin.addUserToWorkspace(
        selectedRow.ws.id,
        userId
      );
      if (!success) {
        showToast(error || "Failed to assign user.", "error");
        return;
      }
      setWorkspaceMembers(users || []);
      await loadData();
      showToast("User assigned to workspace.", "success");
      setShowAssignUsers(false);
      setAssignSearch("");
    } finally {
      setBusy(false);
    }
  }

  async function createUserForWorkspace() {
    if (!selectedRow?.ws) return;
    const nextUsername = window.prompt(
      "Username for new user (or leave blank to auto-generate)",
      ""
    );
    if (nextUsername === null) return;

    let username = nextUsername.trim();
    if (!username) {
      const suffix = Math.random().toString(36).slice(2, 8);
      username = `user-${selectedRow.ws.slug}-${suffix}`.slice(0, USERNAME_MAX_LENGTH);
    }
    if (
      username.length < USERNAME_MIN_LENGTH ||
      username.length > USERNAME_MAX_LENGTH ||
      !new RegExp(`^${USERNAME_PATTERN}$`).test(username)
    ) {
      showToast("Invalid username format.", "error");
      return;
    }

    const password = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}A!`;

    setBusy(true);
    try {
      const { user, error: userError } = await Admin.newUser({
        username,
        password,
        role: "default",
      });
      if (!user) {
        showToast(userError || "Failed to create user.", "error");
        return;
      }
      const { success, error, users } = await Admin.addUserToWorkspace(
        selectedRow.ws.id,
        user.id
      );
      if (!success) {
        await Admin.deleteUser(user.id);
        showToast(error || "Failed to assign user.", "error");
        return;
      }
      setWorkspaceMembers(users || []);
      await loadData();
      showToast(`User ${username} created and assigned.`, "success");
      setShowAssignUsers(false);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUserWorkspace(row) {
    if (!row?.ws) return;
    if (!canDeleteWorkspace(row.ws)) {
      showToast("You can only delete workspaces you created.", "error");
      return;
    }
    if (
      !window.confirm(
        `Delete workspace "${row.ws.name}"? User accounts are kept and can stay in other workspaces.`
      )
    )
      return;

    setBusy(true);
    try {
      await Admin.deleteWorkspace(row.ws.id);
      showToast("Workspace deleted.", "success");
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  async function editWorkspaceUser(member) {
    const user = usersById.get(member.userId);
    if (!user) return;
    const nextUsername = window.prompt("Username", user.username || "");
    if (nextUsername === null) return;
    const normalizedUsername = nextUsername.trim();
    if (
      normalizedUsername.length < USERNAME_MIN_LENGTH ||
      normalizedUsername.length > USERNAME_MAX_LENGTH ||
      !new RegExp(`^${USERNAME_PATTERN}$`).test(normalizedUsername)
    ) {
      showToast("Invalid username format.", "error");
      return;
    }

    const nextPassword = window.prompt(
      "New password (optional, min 8 chars). Leave blank to keep current password.",
      ""
    );
    if (
      nextPassword !== null &&
      nextPassword.length > 0 &&
      nextPassword.length < 8
    ) {
      showToast("Password must be at least 8 characters.", "error");
      return;
    }

    const payload = { username: normalizedUsername };
    if (nextPassword && nextPassword.length >= 8)
      payload.password = nextPassword;

    setBusy(true);
    try {
      const { success, error } = await Admin.updateUser(user.id, payload);
      if (!success) {
        showToast(error || "Failed to update user.", "error");
        return;
      }
      showToast("User updated.", "success");
      await loadData();
      await loadWorkspaceMembers(selectedRow?.ws?.id);
    } finally {
      setBusy(false);
    }
  }

  async function createUserWorkspace() {
    if (!draft.name.trim()) return showToast("Name is required.", "error");

    setBusy(true);
    try {
      const fullInstructions = `${draft.baseInstructions.trim()}\n\n${
        draft.customInstructions.trim()
          ? `Additional instructions for this user workspace:\n${draft.customInstructions.trim()}`
          : ""
      }`.trim();

      const normalizedName = draft.name.trim();

      if (isAdmin) {
        const generatedUsername = normalizedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 24);
        const uniqueSuffix = Math.random().toString(36).slice(2, 8);
        const username = `${generatedUsername || "workspace"}-${uniqueSuffix}`;
        const password = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}A!`;

        const { user, error: userError } = await Admin.newUser({
          username,
          password,
          role: "default",
        });
        if (!user) {
          showToast(userError || "Failed to create user.", "error");
          return;
        }

        const { workspace, error: wsError } = await Admin.newWorkspace(
          normalizedName
        );
        if (!workspace) {
          await Admin.deleteUser(user.id);
          showToast(wsError || "Failed to create workspace.", "error");
          return;
        }

        await Admin.updateUsersInWorkspace(workspace.id, [user.id]);
        await Workspace.update(workspace.slug, {
          offerKpUserProfile: draft.profileId,
          openAiPrompt: fullInstructions,
          chatProvider: "anthropic",
          agentProvider: "anthropic",
        });
      } else {
        const { workspace, error: wsError } = await Admin.newWorkspace(
          normalizedName
        );
        if (!workspace) {
          showToast(wsError || "Failed to create workspace.", "error");
          return;
        }

        await Workspace.update(workspace.slug, {
          offerKpUserProfile: draft.profileId,
          openAiPrompt: fullInstructions,
          chatProvider: "anthropic",
          agentProvider: "anthropic",
        });
      }

      showToast("User Workspace created.", "success");
      setDraft({
        name: "",
        profileId: "partner",
        baseInstructions: getUserWorkspaceBasePrompt("partner"),
        customInstructions: "",
      });
      setStep(1);
      setShowWizard(false);
      await loadData();
    } catch (e) {
      showToast(e.message || "Failed to create user workspace.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function createPlatformAccount(e) {
    e.preventDefault();
    const username = accountDraft.username.trim();
    const password = accountDraft.password;

    if (
      username.length < USERNAME_MIN_LENGTH ||
      username.length > USERNAME_MAX_LENGTH ||
      !new RegExp(`^${USERNAME_PATTERN}$`).test(username)
    ) {
      showToast("Invalid username format.", "error");
      return;
    }
    if ((password || "").length < 8) {
      showToast("Password must be at least 8 characters.", "error");
      return;
    }

    setBusy(true);
    try {
      const { user, error } = await Admin.newUser({
        username,
        password,
        role: accountDraft.role,
      });
      if (!user) {
        showToast(error || "Failed to create account.", "error");
        return;
      }
      showToast("Account created.", "success");
      setAccountDraft({ username: "", password: "", role: "default" });
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  const selectedProfile = getUserWorkspaceProfile(draft.profileId);

  function openWizard() {
    setStep(1);
    setShowWizard(true);
  }

  function closeWizard() {
    setShowWizard(false);
    setStep(1);
  }

  const wizardPanel = (
    <section className="border-0 bg-transparent">
        {/* Stepper */}
        <div className="offerKp-wizard-stepper">
          {STEPS.map(({ n, label }) => {
            const isDone = step > n;
            const isActive = step === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setStep(n)}
                className={[
                  "offerKp-wizard-step",
                  isActive ? "offerKp-wizard-step--active" : "",
                  isDone ? "offerKp-wizard-step--done" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="offerKp-wizard-step__num">
                  {isDone ? "✓" : n}
                </span>
                {label}
              </button>
            );
          })}
        </div>

        {/* Step content */}
        <div className="px-6 pt-6 pb-2">
          {step === 1 && (
            <div>
              <label className="offerKp-field-label">
                Workspace name
              </label>
              <p className="offerKp-field-hint mb-3">
                Identifies the client or entity — e.g.{" "}
                <em>Entreprise DUPONT</em> or <em>Cabinet Legrand</em>.
              </p>
              <input
                className="offerKp-carbon-input w-full"
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="Workspace name"
                autoFocus
              />
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="offerKp-field-label">
                Access profile
              </label>
              <p className="offerKp-field-hint mb-4">
                Choose the template that defines this user's base system
                instructions.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {USER_WORKSPACE_PROFILES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onProfileChange(p.id)}
                    className={[
                      "text-left border px-4 py-3 transition-colors",
                      draft.profileId === p.id
                        ? "border-primary-button bg-theme-sidebar-item-selected"
                        : "border-theme-sidebar-border hover:bg-theme-sidebar-item-hover",
                    ].join(" ")}
                  >
                    <div
                      className="text-xs font-semibold uppercase tracking-wider mb-1"
                      style={{ color: p.color || "var(--theme-button-primary)" }}
                    >
                      {p.code}
                    </div>
                    <div className="text-sm text-theme-text-primary">
                      {p.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <label className="offerKp-field-label">
                Base instructions{" "}
                <span className="font-normal text-theme-text-secondary">
                  — template from profile{" "}
                  <em>{selectedProfile.code}</em>
                </span>
              </label>
              <p className="offerKp-field-hint mb-3">
                These instructions come from the profile template. You can edit
                them before creating the workspace.
              </p>
              <textarea
                className="offerKp-carbon-textarea w-full"
                value={draft.baseInstructions}
                onChange={(e) =>
                  updateDraft({ baseInstructions: e.target.value })
                }
                rows={12}
              />
              <p className="offerKp-char-count">
                {draft.baseInstructions.length} chars
              </p>
            </div>
          )}

          {step === 4 && (
            <div>
              <label className="offerKp-field-label">
                Custom instructions{" "}
                <span className="font-normal text-theme-text-secondary">
                  — optional
                </span>
              </label>
              <p className="offerKp-field-hint mb-3">
                Workspace-specific overrides: territory, negotiated pricing,
                rate limits, special clauses…
              </p>
              <textarea
                className="offerKp-carbon-textarea w-full"
                value={draft.customInstructions}
                onChange={(e) =>
                  updateDraft({ customInstructions: e.target.value })
                }
                placeholder="Leave blank to use only the base instructions."
                rows={8}
              />
              <p className="offerKp-char-count">
                {draft.customInstructions.length} chars
              </p>
            </div>
          )}

          {step === 5 && (
            <div>
              <label className="offerKp-field-label mb-4">
                Review before creating
              </label>
              <dl className="offerKp-summary-grid">
                <div className="offerKp-summary-row">
                  <dt>Name</dt>
                  <dd>{draft.name || <em className="text-theme-text-secondary">—</em>}</dd>
                </div>
                <div className="offerKp-summary-row">
                  <dt>Profile</dt>
                  <dd>
                    <span
                      className="inline-block px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ background: selectedProfile.color || "#0f62fe" }}
                    >
                      {selectedProfile.code}
                    </span>{" "}
                    {selectedProfile.label}
                  </dd>
                </div>
                <div className="offerKp-summary-row">
                  <dt>Base instructions</dt>
                  <dd>{draft.baseInstructions.length} chars</dd>
                </div>
                <div className="offerKp-summary-row">
                  <dt>Custom instructions</dt>
                  <dd>
                    {draft.customInstructions.length > 0
                      ? `${draft.customInstructions.length} chars`
                      : <em className="text-theme-text-secondary">none</em>}
                  </dd>
                </div>
                <div className="offerKp-summary-row">
                  <dt>Total prompt</dt>
                  <dd>
                    {(draft.baseInstructions + draft.customInstructions).length}{" "}
                    chars
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* Wizard footer */}
        <div className="offerKp-wizard-footer px-6">
          {step > 1 && (
            <button
              type="button"
              className="offerKp-btn-ghost"
              onClick={() => setStep(step - 1)}
            >
              Back
            </button>
          )}
          {step < 5 ? (
            <button
              type="button"
              className="offerKp-btn-new-chat w-auto"
              onClick={() => setStep(step + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="offerKp-btn-new-chat w-auto"
              disabled={busy || !draft.name.trim()}
              onClick={createUserWorkspace}
            >
              {busy ? "Creating…" : "Create User Workspace"}
            </button>
          )}
        </div>
    </section>
  );

  return (
    <OfferKpSuiteLayout>
      <div className="uw-macos-page">
        <header className="offerKp-suite-page-header">
          <h1 className="offerKp-suite-page-title !mb-0">
            {t("admin.nav.userWorkspaces", { defaultValue: "User Workspaces" })}
          </h1>
          <div className="offerKp-suite-page-header__row">
            <p className="offerKp-field-hint !mt-0 flex-1 min-w-0">
              {t("admin.userWorkspaces.hint", {
                defaultValue:
                  "Select a workspace below. Assign users per workspace; suspend applies only to that workspace.",
              })}
              {!loading && rows.length > 0 && (
                <>
                  {" "}
                  · {rows.length}{" "}
                  {rows.length === 1
                    ? t("admin.userWorkspaces.workspaceOne", {
                        defaultValue: "workspace",
                      })
                    : t("admin.userWorkspaces.workspaceMany", {
                        defaultValue: "workspaces",
                      })}
                </>
              )}
            </p>
            <button
              type="button"
              className="carbon-tertiary-btn shrink-0 px-4 py-2 min-h-[40px]"
              onClick={openWizard}
            >
              + {t("admin.userWorkspaces.newWorkspace", { defaultValue: "New workspace" })}
            </button>
          </div>
        </header>

        <div className="uw-macos-desktop">
          {loading ? (
            <div className="uw-macos-empty">
              <p className="uw-macos-empty__hint">Loading…</p>
            </div>
          ) : !selectedRow ? (
            <div className="uw-macos-empty">
              <div className="uw-macos-empty__icon" aria-hidden>
                📁
              </div>
              <p className="uw-macos-empty__title">No workspaces yet</p>
              <p className="uw-macos-empty__hint">
                Click <strong>+</strong> in the dock to create your first User
                Workspace.
              </p>
            </div>
          ) : (
            <article className="uw-macos-window">
              <header className="uw-macos-window__chrome">
                <span className="uw-macos-window__title">
                  {selectedRow.ws.name}
                </span>
              </header>
              <div className="uw-macos-window__body">
                <dl className="uw-macos-meta">
                  <div className="uw-macos-meta__row">
                    <dt className="uw-macos-meta__label">Profile</dt>
                    <dd className="uw-macos-meta__value">
                      <span
                        className="uw-macos-profile-pill"
                        style={{
                          background:
                            selectedRow.profile.color || "#0f62fe",
                        }}
                      >
                        {selectedRow.profile.code}
                      </span>{" "}
                      {selectedRow.profile.label}
                    </dd>
                  </div>
                </dl>

                <section className="uw-macos-members">
                  <div className="uw-macos-members__head">
                    <h2 className="uw-macos-members__title">Users</h2>
                    <div className="uw-macos-members__head-actions">
                      <button
                        type="button"
                        className="uw-macos-btn uw-macos-btn--secondary"
                        disabled={busy}
                        onClick={() => setShowAssignUsers((v) => !v)}
                      >
                        {showAssignUsers ? "Close" : "Assign user"}
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="uw-macos-btn uw-macos-btn--secondary"
                          disabled={busy}
                          onClick={createUserForWorkspace}
                        >
                          New user
                        </button>
                      )}
                    </div>
                  </div>

                  {showAssignUsers && (
                    <div className="uw-macos-assign">
                      <input
                        type="search"
                        className="offerKp-carbon-input w-full"
                        placeholder="Search users…"
                        value={assignSearch}
                        onChange={(e) => setAssignSearch(e.target.value)}
                        disabled={busy}
                      />
                      <ul className="uw-macos-assign__list">
                        {assignableUsers.length === 0 ? (
                          <li className="uw-macos-assign__empty">
                            No users available to assign.
                          </li>
                        ) : (
                          assignableUsers.map((u) => (
                            <li key={u.id}>
                              <button
                                type="button"
                                className="uw-macos-assign__item"
                                disabled={busy}
                                onClick={() => assignUserToWorkspace(u.id)}
                              >
                                {u.username || `user #${u.id}`}
                                <span className="text-theme-text-secondary">
                                  {" "}
                                  ({u.role})
                                </span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  )}

                  {membersLoading ? (
                    <p className="uw-macos-members__hint">Loading users…</p>
                  ) : workspaceMembers.length === 0 ? (
                    <p className="uw-macos-members__hint">
                      {isAdmin
                        ? "No users assigned. Use Assign user or New user."
                        : "No users assigned. Use Assign user to share this workspace."}
                    </p>
                  ) : (
                    <ul className="uw-macos-members__list">
                      {workspaceMembers.map((member) => {
                        const account = usersById.get(member.userId);
                        const globallySuspended = account?.suspended === 1;
                        return (
                          <li key={member.userId} className="uw-macos-member">
                            <div className="uw-macos-member__info">
                              <span className="uw-macos-member__name">
                                {member.username}
                              </span>
                              {member.suspended === 1 && (
                                <span className="uw-macos-status">
                                  suspended here
                                </span>
                              )}
                              {globallySuspended && (
                                <span className="uw-macos-status">
                                  account suspended
                                </span>
                              )}
                            </div>
                            <div className="uw-macos-member__actions">
                              <button
                                type="button"
                                className="uw-macos-btn uw-macos-btn--secondary"
                                disabled={busy}
                                onClick={() => editWorkspaceUser(member)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="uw-macos-btn uw-macos-btn--secondary"
                                disabled={busy}
                                onClick={() => suspendMemberInWorkspace(member)}
                              >
                                {member.suspended === 1
                                  ? "Unsuspend"
                                  : "Suspend"}
                              </button>
                              <button
                                type="button"
                                className="uw-macos-btn uw-macos-btn--danger"
                                disabled={busy}
                                onClick={() => removeMemberFromWorkspace(member)}
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <div className="uw-macos-actions">
                  <div className="uw-macos-actions__group">
                    <Link
                      to={paths.workspace.chat(selectedRow.ws.slug)}
                      className="uw-macos-btn uw-macos-btn--primary"
                    >
                      Open chat
                    </Link>
                    <Link
                      to={paths.settings.userWorkspaceInstructions(
                        selectedRow.ws.slug
                      )}
                      className="uw-macos-btn uw-macos-btn--secondary"
                    >
                      Instructions
                    </Link>
                    <Link
                      to={paths.settings.userWorkspaceFiles(selectedRow.ws.slug)}
                      className="uw-macos-btn uw-macos-btn--secondary"
                    >
                      Files
                    </Link>
                  </div>
                  {canDeleteWorkspace(selectedRow.ws) && (
                    <div className="uw-macos-actions__group">
                      <button
                        type="button"
                        className="uw-macos-btn uw-macos-btn--danger"
                        disabled={busy}
                        onClick={() => deleteUserWorkspace(selectedRow)}
                      >
                        Delete workspace
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          )}
        </div>

        {isAdmin && (
        <details className="uw-macos-account-panel">
          <summary>Platform account (no workspace)</summary>
          <p className="offerKp-field-hint mt-3 mb-4">
            For admins or managers — without a dedicated workspace.
          </p>
          <form
            className="grid sm:grid-cols-3 gap-3"
            onSubmit={createPlatformAccount}
          >
            <div>
              <label className="offerKp-field-label text-xs">
                Username
              </label>
              <input
                className="offerKp-carbon-input w-full"
                value={accountDraft.username}
                onChange={(e) =>
                  setAccountDraft((prev) => ({
                    ...prev,
                    username: e.target.value,
                  }))
                }
                placeholder="e.g. jdupont"
                minLength={USERNAME_MIN_LENGTH}
                maxLength={USERNAME_MAX_LENGTH}
                pattern={USERNAME_PATTERN}
                autoComplete="off"
                required
                disabled={busy}
              />
            </div>
            <div>
              <label className="offerKp-field-label text-xs">
                Password
              </label>
              <input
                type="password"
                className="offerKp-carbon-input w-full"
                value={accountDraft.password}
                onChange={(e) =>
                  setAccountDraft((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                placeholder="Min 8 characters"
                minLength={8}
                required
                autoComplete="new-password"
                disabled={busy}
              />
            </div>
            <div>
              <label className="offerKp-field-label text-xs">Role</label>
              <select
                className="offerKp-carbon-select w-full"
                value={accountDraft.role}
                onChange={(e) =>
                  setAccountDraft((prev) => ({ ...prev, role: e.target.value }))
                }
                disabled={busy}
              >
                <option value="default">default</option>
                <option value="manager">manager</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                className="offerKp-btn-new-chat w-auto"
                disabled={busy}
              >
                {busy ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        </details>
        )}

        <nav className="uw-macos-dock-wrap" aria-label="User workspaces dock">
          <div className="uw-macos-dock" role="list">
            {rows.map((row) => {
              const active = selectedRow?.ws.id === row.ws.id;
              return (
                <button
                  key={row.ws.id}
                  type="button"
                  role="listitem"
                  className={[
                    "uw-macos-dock__item",
                    active ? "uw-macos-dock__item--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedId(row.ws.id)}
                  title={row.ws.name}
                >
                  <span
                    className="uw-macos-dock__icon"
                    style={{
                      background: row.profile.color || "#0f62fe",
                    }}
                  >
                    {workspaceInitials(row.ws.name)}
                  </span>
                  <span className="uw-macos-dock__indicator" aria-hidden />
                  <span className="uw-macos-dock__label">{row.ws.name}</span>
                </button>
              );
            })}
            {rows.length > 0 && <span className="uw-macos-dock__divider" />}
            <button
              type="button"
              className="uw-macos-dock__item"
              onClick={openWizard}
              title="New User Workspace"
              aria-label="New User Workspace"
            >
              <span className="uw-macos-dock__icon uw-macos-dock__icon--add">
                +
              </span>
              <span className="uw-macos-dock__indicator" aria-hidden />
              <span className="uw-macos-dock__label">New</span>
            </button>
          </div>
        </nav>
      </div>

      {showWizard && (
        <div
          className="uw-macos-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="uw-wizard-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeWizard();
          }}
        >
          <div className="uw-macos-sheet">
            <header className="uw-macos-sheet__header">
              <h2 id="uw-wizard-title" className="uw-macos-sheet__title">
                New User Workspace
              </h2>
              <button
                type="button"
                className="uw-macos-sheet__close"
                onClick={closeWizard}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="uw-macos-sheet__body">{wizardPanel}</div>
          </div>
        </div>
      )}
    </OfferKpSuiteLayout>
  );
}
