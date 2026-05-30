import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Admin from "@/models/admin";
import useUser from "@/hooks/useUser";
import showToast from "@/utils/toast";
import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from "@/utils/username";

const ModMap = {
  admin: ["admin", "manager", "default"],
  manager: ["manager", "default"],
  default: [],
};

function canModifyUser(currUser, targetUser) {
  return ModMap[currUser?.role || "default"].includes(targetUser.role);
}

export default function AccountUsersPanel() {
  const { t } = useTranslation("offerKp");
  const { user: currUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({
    username: "",
    password: "",
    role: "default",
  });
  const [busy, setBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const us = await Admin.users();
      setUsers(us);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleCreateUser(e) {
    e.preventDefault();
    setBusy(true);
    const { user, error } = await Admin.newUser(newUserForm);
    setBusy(false);
    if (!user) {
      showToast(error || t("account.userCreateFailed"), "error");
      return;
    }
    showToast(t("account.userCreated"), "success");
    setNewUserForm({ username: "", password: "", role: "default" });
    await loadUsers();
  }

  async function handleSuspend(user) {
    const suspended = user.suspended === 1;
    if (
      !window.confirm(
        suspended
          ? t("account.unsuspendConfirm", { name: user.username })
          : t("account.suspendConfirm", { name: user.username })
      )
    ) {
      return;
    }
    const { success, error } = await Admin.updateUser(user.id, {
      suspended: suspended ? 0 : 1,
    });
    if (!success) {
      showToast(error, "error");
      return;
    }
    showToast(
      suspended ? t("account.userUnsuspended") : t("account.userSuspended"),
      "success"
    );
    await loadUsers();
  }

  async function handleDeleteUser(user) {
    if (!window.confirm(t("account.userDeleteConfirm", { name: user.username }))) {
      return;
    }
    const { success, error } = await Admin.deleteUser(user.id);
    if (!success) {
      showToast(error, "error");
      return;
    }
    showToast(t("account.userDeleted"), "success");
    await loadUsers();
  }

  async function handleEditUser(targetUser) {
    const allowedRoles = ModMap[currUser?.role || "default"];
    const nextUsername = window.prompt(
      t("account.usernamePlaceholder"),
      targetUser.username || ""
    );
    if (nextUsername === null) return;

    const normalizedUsername = nextUsername.trim();
    if (
      normalizedUsername.length < USERNAME_MIN_LENGTH ||
      normalizedUsername.length > USERNAME_MAX_LENGTH ||
      !new RegExp(`^${USERNAME_PATTERN}$`).test(normalizedUsername)
    ) {
      showToast(t("account.userCreateFailed"), "error");
      return;
    }

    const rolePrompt = `${t("account.role")} (${allowedRoles.join(", ")})`;
    const nextRole = window.prompt(rolePrompt, targetUser.role || "default");
    if (nextRole === null) return;
    if (!allowedRoles.includes(nextRole)) {
      showToast(t("account.userCreateFailed"), "error");
      return;
    }

    const nextPassword = window.prompt(
      `${t("account.passwordPlaceholder")} (optional)`,
      ""
    );
    if (nextPassword !== null && nextPassword.length > 0 && nextPassword.length < 8) {
      showToast(t("account.userCreateFailed"), "error");
      return;
    }

    setBusy(true);
    const payload = {
      username: normalizedUsername,
      role: nextRole,
    };
    if (nextPassword && nextPassword.length >= 8) {
      payload.password = nextPassword;
    }
    const { success, error } = await Admin.updateUser(targetUser.id, payload);
    setBusy(false);
    if (!success) {
      showToast(error || t("account.userCreateFailed"), "error");
      return;
    }
    showToast("User updated.", "success");
    await loadUsers();
  }

  if (loading) {
    return (
      <p className="text-sm text-theme-text-secondary">{t("account.loadingAdmin")}</p>
    );
  }

  const isAdmin = currUser?.role === "admin";

  return (
    <div className="max-w-2xl space-y-4">
      {isAdmin && (
      <form
        onSubmit={handleCreateUser}
        className="border border-theme-sidebar-border bg-theme-bg-primary p-6 grid gap-3 sm:grid-cols-2"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-text-primary sm:col-span-2">
          {t("account.createUser")}
        </h2>
        <input
          name="username"
          type="text"
          value={newUserForm.username}
          onChange={(e) =>
            setNewUserForm((f) => ({ ...f, username: e.target.value }))
          }
          placeholder={t("account.usernamePlaceholder")}
          className="offerKp-carbon-input sm:col-span-2"
          minLength={USERNAME_MIN_LENGTH}
          maxLength={USERNAME_MAX_LENGTH}
          pattern={USERNAME_PATTERN}
          required
          autoComplete="off"
          disabled={busy}
        />
        <input
          name="password"
          type="password"
          value={newUserForm.password}
          onChange={(e) =>
            setNewUserForm((f) => ({ ...f, password: e.target.value }))
          }
          placeholder={t("account.passwordPlaceholder")}
          className="offerKp-carbon-input"
          minLength={8}
          required
          autoComplete="new-password"
          disabled={busy}
        />
        <select
          value={newUserForm.role}
          onChange={(e) =>
            setNewUserForm((f) => ({ ...f, role: e.target.value }))
          }
          className="offerKp-carbon-select"
          disabled={busy}
        >
          <option value="default">{t("account.roleDefault")}</option>
          <option value="manager">{t("account.roleManager")}</option>
          {currUser?.role === "admin" && (
            <option value="admin">{t("account.roleAdmin")}</option>
          )}
        </select>
        <button
          type="submit"
          className="offerKp-btn-new-chat w-auto sm:col-span-2"
          disabled={busy}
        >
          {t("account.createUser")}
        </button>
      </form>
      )}

      <section className="border border-theme-sidebar-border bg-theme-bg-primary p-6 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-theme-text-primary">
          {t("account.usersTitle")}
        </h2>
        <ul className="divide-y divide-theme-sidebar-border text-sm">
          {users.map((u) => {
            const modifiable =
              currUser?.id !== u.id && canModifyUser(currUser, u);
            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="text-theme-text-primary">
                  {u.username || `user #${u.id}`}{" "}
                  <span className="text-theme-text-secondary text-xs capitalize">
                    {u.role}
                    {u.suspended === 1 ? ` · ${t("account.suspended")}` : ""}
                  </span>
                </span>
                {modifiable && (
                  <span className="flex gap-3 text-xs">
                    <button
                      type="button"
                      className="text-primary-button hover:underline"
                      disabled={busy}
                      onClick={() => handleEditUser(u)}
                    >
                      Edit user
                    </button>
                    <button
                      type="button"
                      className="text-yellow-700 hover:underline"
                      disabled={busy}
                      onClick={() => handleSuspend(u)}
                    >
                      {u.suspended === 1
                        ? t("account.unsuspendUser")
                        : t("account.suspendUser")}
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        disabled={busy}
                        onClick={() => handleDeleteUser(u)}
                      >
                        {t("account.deleteUser")}
                      </button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
