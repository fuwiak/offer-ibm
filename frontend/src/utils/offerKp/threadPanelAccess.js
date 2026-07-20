import { getEffectiveWorkspaceProfile } from "./userWorkspaceProfiles";

/** Right panel Memory / Instructions / Files — admin workspace only. */
export function canShowAdminThreadContextPanel({ workspace, userRole } = {}) {
  const profile = getEffectiveWorkspaceProfile({ userRole, workspace });
  return profile.id === "admin";
}

/**
 * Thread Files section for operators (partner/sales/admin).
 * Public/supplier stay without the files panel.
 */
export function canShowThreadFilesPanel({ workspace, userRole } = {}) {
  const profile = getEffectiveWorkspaceProfile({ userRole, workspace });
  return ["admin", "partner", "internal_sales", "external_sales"].includes(
    profile.id
  );
}

/** Hide raw agent/system status lines from end-user chat. */
export function isHiddenAgentStatusMessage(content = "") {
  const text = String(content || "").trim();
  if (!text) return true;
  return (
    /^@agent:\s*swapping over to agent chat/i.test(text) ||
    /^@agent:\s*type \/exit/i.test(text) ||
    /^@agent$/i.test(text)
  );
}
