import { OFFER_KP_BOT_PROFILE_PROMPTS } from "@/config/offerKpBotProfilePrompts";

export const USER_WORKSPACE_PROFILES = [
  {
    id: "admin",
    code: "ADMIN",
    label: "Admin",
    color: "#1B2A4A",
  },
  {
    id: "partner",
    code: "PARTNER",
    label: "Partner",
    color: "#0C7D69",
  },
  {
    id: "internal_sales",
    code: "SALES",
    label: "Sales",
    color: "#E87722",
  },
  {
    id: "external_sales",
    code: "AGENT",
    label: "Agent",
    color: "#D97706",
  },
  {
    id: "supplier",
    code: "SUPPLIER",
    label: "Supplier",
    color: "#6A3FA0",
  },
  {
    id: "public",
    code: "PUBLIC",
    label: "Public",
    color: "#667085",
  },
];

export function getUserWorkspaceProfile(profileId) {
  const id = profileId === "default" ? "public" : profileId;
  return (
    USER_WORKSPACE_PROFILES.find((p) => p.id === id) ||
    USER_WORKSPACE_PROFILES.find((p) => p.id === "partner")
  );
}

export function getUserWorkspaceBasePrompt(profileId) {
  return OFFER_KP_BOT_PROFILE_PROMPTS[profileId] || "";
}

/** Infer offer-kp profile from workspace slug (partner-a, offerKp-sales-*, etc.). */
export function resolveProfileIdFromWorkspace(workspace) {
  const slug = `${workspace?.slug || ""}`.toLowerCase();
  const name = `${workspace?.name || ""}`.toLowerCase();
  const hay = `${slug} ${name}`;

  if (hay.includes("supplier")) return "supplier";
  if (hay.includes("public")) return "public";
  if (hay.includes("admin")) return "admin";
  if (hay.includes("partner")) return "partner";
  if (hay.includes("agent") || hay.includes("external")) return "external_sales";
  if (hay.includes("sales") || hay.includes("commercial")) return "internal_sales";

  return null;
}

export function isPublicWorkspace(workspace) {
  if (!workspace) return false;
  if (workspace.offerKpUserProfile === "public") return true;
  const slug = `${workspace.slug || ""}`.toLowerCase();
  if (slug.includes("public")) return true;
  return `${workspace.name || ""}`.toLowerCase().includes("public");
}

export function isAdminWorkspace(workspace) {
  if (!workspace) return false;
  if (workspace.offerKpUserProfile === "admin") return true;
  const slug = `${workspace.slug || ""}`.toLowerCase();
  const name = `${workspace.name || ""}`.toLowerCase();
  const hay = `${slug} ${name}`;
  if (hay.includes("public")) return false;
  return hay.includes("admin");
}

/** Match server workspace list rules for the space switcher. */
export function filterWorkspacesForViewer(workspaces, userRole) {
  const list = Array.isArray(workspaces) ? workspaces : [];
  if (userRole === "admin") return list;
  return list.filter((ws) => {
    if (isPublicWorkspace(ws)) return true;
    if (userRole === "manager" && isAdminWorkspace(ws)) return false;
    return true;
  });
}

export function getEffectiveWorkspaceProfile({ userRole, workspace } = {}) {
  const explicit = workspace?.offerKpUserProfile;
  if (explicit) return getUserWorkspaceProfile(explicit);

  const fromWorkspace = resolveProfileIdFromWorkspace(workspace);
  const fromUser =
    userRole === "admin"
      ? "admin"
      : userRole && userRole !== "default" && userRole !== "manager"
        ? userRole
        : null;
  return getUserWorkspaceProfile(fromWorkspace || fromUser || "partner");
}
