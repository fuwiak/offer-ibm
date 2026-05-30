const { ROLES } = require("../middleware/multiUserProtected");

function getPublicWorkspaceSlug() {
  return (
    process.env.LAWYER_REVIZORRO_PUBLIC_WORKSPACE || "lawyerRevizorro-public"
  ).toLowerCase();
}

function isPublicWorkspace(workspace) {
  if (!workspace) return false;
  if (workspace.lawyerRevizorroUserProfile === "public") return true;
  const slug = `${workspace.slug || ""}`.toLowerCase();
  if (slug === getPublicWorkspaceSlug()) return true;
  if (slug.includes("public")) return true;
  return `${workspace.name || ""}`.toLowerCase().includes("public");
}

function isAdminWorkspace(workspace) {
  if (!workspace) return false;
  if (workspace.lawyerRevizorroUserProfile === "admin") return true;
  const slug = `${workspace.slug || ""}`.toLowerCase();
  const name = `${workspace.name || ""}`.toLowerCase();
  const hay = `${slug} ${name}`;
  if (hay.includes("public")) return false;
  return hay.includes("admin");
}

function isWorkspaceMember(user, workspace) {
  if (!user?.id || !workspace) return false;
  const members = workspace.workspace_users || [];
  return members.some(
    (wu) => wu.user_id === user.id && (wu.suspended ?? 0) === 0
  );
}

function canUserAccessWorkspace(user, workspace) {
  if (!workspace) return false;
  if (!user?.id) return isPublicWorkspace(workspace);
  if (user.role === ROLES.admin) return true;
  if (isPublicWorkspace(workspace)) return true;
  if (!isWorkspaceMember(user, workspace)) return false;
  if (user.role === ROLES.manager && isAdminWorkspace(workspace)) return false;
  return true;
}

function filterWorkspacesForUser(user, workspaces = []) {
  if (!user) return [];
  if (user.role === ROLES.admin) return workspaces;
  return workspaces.filter((ws) => canUserAccessWorkspace(user, ws));
}

function canManagerDeleteWorkspace(user, workspace) {
  if (!user?.id || !workspace) return false;
  if (user.role === ROLES.admin) return true;
  if (user.role !== ROLES.manager) return false;
  return Number(workspace.createdBy) === Number(user.id);
}

function canUserManageWorkspaceMembers(user, workspace) {
  if (!user?.id || !workspace) return false;
  if (user.role === ROLES.admin) return true;
  return canUserAccessWorkspace(user, workspace);
}

module.exports = {
  canManagerDeleteWorkspace,
  canUserAccessWorkspace,
  canUserManageWorkspaceMembers,
  filterWorkspacesForUser,
  isAdminWorkspace,
  isPublicWorkspace,
};
