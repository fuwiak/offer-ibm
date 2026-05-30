/** Workspace creation wizard — draft shape & presets for lawyer-revizorro Suite */

import {
  LAWYER_REVIZORRO_BOT_PROFILES,
  LAWYER_REVIZORRO_BOT_PROFILE_PROMPTS,
} from "@/config/lawyerRevizorroBotProfilePrompts";

export const WIZARD_STEPS = [
  { id: 1, key: "general", label: "General Information" },
  { id: 2, key: "instructions", label: "Instructions & AI" },
  { id: 3, key: "documents", label: "Documents & Resources" },
  { id: 4, key: "access", label: "Access & Permissions" },
  { id: 5, key: "summary", label: "Summary" },
];

/** @deprecated use LAWYER_REVIZORRO_BOT_PROFILES — kept for chip colors in wizard */
export const WORKSPACE_MODEL_PRESETS = LAWYER_REVIZORRO_BOT_PROFILES.map((p) => ({
  ...p,
  color:
    {
      admin: "#161616",
      public: "#525252",
      partner: "#0f62fe",
      internal_sales: "#1192e8",
      external_sales: "#8a3ffc",
      supplier: "#198038",
    }[p.id] || "#0f62fe",
}));

export const WORKSPACE_TEMPLATES = LAWYER_REVIZORRO_BOT_PROFILES.map((p) => ({
  id: p.id,
  title: `${p.label} Template`,
  description: `Default system instructions for ${p.label}.`,
  prompt: LAWYER_REVIZORRO_BOT_PROFILE_PROMPTS[p.id],
}));

export const SUPPORTING_DOCUMENTS = [
  { name: "Workspace_creation_guide.pdf", size: "1.2 MB", type: "pdf" },
  { name: "AI_instructions_best_practices.docx", size: "340 KB", type: "docx" },
  { name: "Visibility_rules_overview.pdf", size: "890 KB", type: "pdf" },
  { name: "Partner_data_isolation_policy.pdf", size: "520 KB", type: "pdf" },
  { name: "LandVac_supplier_workflow.pdf", size: "710 KB", type: "pdf" },
];

export const DRAFT_STORAGE_KEY = "lawyerRevizorro-workspace-wizard-draft";

export function initialWizardDraft() {
  return {
    name: "",
    description: "",
    profileType: "partner",
    openAiPrompt: LAWYER_REVIZORRO_BOT_PROFILE_PROMPTS.partner,
    modelTags: ["partner"],
    suggestActions: true,
    contextualMemory: false,
    strictMode: false,
    documentNotes: "",
    pendingFiles: [],
    userIds: [],
    templateId: null,
  };
}

export function loadWizardDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return initialWizardDraft();
    return { ...initialWizardDraft(), ...JSON.parse(raw) };
  } catch {
    return initialWizardDraft();
  }
}

export function saveWizardDraft(draft) {
  sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearWizardDraft() {
  sessionStorage.removeItem(DRAFT_STORAGE_KEY);
}
