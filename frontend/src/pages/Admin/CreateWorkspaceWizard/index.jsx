import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Info } from "@phosphor-icons/react";
import LawyerRevizorroSuiteLayout from "@/layouts/LawyerRevizorroSuiteLayout";
import WizardRightPanel from "@/components/LawyerRevizorro/WorkspaceWizard/WizardRightPanel";
import Workspace from "@/models/workspace";
import Admin from "@/models/admin";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import {
  WIZARD_STEPS,
  WORKSPACE_MODEL_PRESETS,
  loadWizardDraft,
  saveWizardDraft,
  clearWizardDraft,
} from "@/utils/lawyerRevizorro/workspaceWizard";
import { resolveProfilePromptChange } from "@/utils/lawyerRevizorro/workspaceProfilePrompt";

const MAX_PROMPT = 12000;

export default function CreateWorkspaceWizard() {
  const { t } = useTranslation("lawyerRevizorro");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const stepFromUrl = Number(searchParams.get("step") || "1");
  const [step, setStep] = useState(
    stepFromUrl >= 1 && stepFromUrl <= 5 ? stepFromUrl : 1
  );
  const [draft, setDraft] = useState(loadWizardDraft);
  const [users, setUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Admin.users().then(setUsers);
  }, []);

  useEffect(() => {
    saveWizardDraft(draft);
  }, [draft]);

  useEffect(() => {
    setSearchParams({ step: String(step) }, { replace: true });
  }, [step, setSearchParams]);

  function updateDraft(patch) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function handleProfileTypeChange(newProfile, eventTarget) {
    const { apply, nextPrompt } = resolveProfilePromptChange(
      draft.profileType,
      draft.openAiPrompt,
      newProfile,
      t
    );
    if (!apply) {
      if (eventTarget) eventTarget.value = draft.profileType;
      return;
    }
    updateDraft({
      profileType: newProfile,
      openAiPrompt: nextPrompt,
      modelTags: draft.modelTags.includes(newProfile)
        ? draft.modelTags
        : [...draft.modelTags, newProfile],
    });
  }

  function goTo(s) {
    setStep(s);
  }

  function handleUseTemplate(tpl) {
    updateDraft({
      templateId: tpl.id,
      openAiPrompt: tpl.prompt,
      modelTags: [tpl.id],
      profileType: tpl.id,
      name: draft.name || tpl.title.replace(" Template", ""),
    });
    showToast(t(`admin.templateApplied`, { name: tpl.title }), "success");
  }

  async function handleCreate() {
    if (!draft.name?.trim()) {
      showToast(t("admin.errors.nameRequired"), "error");
      goTo(1);
      return;
    }
    setSubmitting(true);
    try {
      const { workspace, error } = await Admin.newWorkspace(draft.name.trim());
      if (!workspace) {
        showToast(error || t("admin.errors.createFailed"), "error");
        setSubmitting(false);
        return;
      }

      const updatePayload = {
        openAiPrompt: draft.openAiPrompt?.trim() || undefined,
        lawyerRevizorroUserProfile: draft.profileType || undefined,
      };
      if (draft.strictMode) {
        updatePayload.queryRefusalResponse =
          "I can only answer within the scope defined for this workspace.";
      }

      await Workspace.update(workspace.slug, updatePayload);

      if (draft.userIds?.length > 0) {
        await Admin.updateUsersInWorkspace(workspace.id, draft.userIds);
      }

      clearWizardDraft();
      showToast(t("admin.workspaceCreated"), "success");
      navigate(paths.workspace.settings.chatSettings(workspace.slug));
    } catch (e) {
      console.error(e);
      showToast(t("admin.errors.createFailed"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleModelTag(id) {
    const tags = draft.modelTags.includes(id)
      ? draft.modelTags.filter((x) => x !== id)
      : [...draft.modelTags, id];
    updateDraft({ modelTags: tags });
  }

  function toggleUser(id) {
    const ids = draft.userIds.includes(id)
      ? draft.userIds.filter((x) => x !== id)
      : [...draft.userIds, id];
    updateDraft({ userIds: ids });
  }

  const rightPanel = <WizardRightPanel onUseTemplate={handleUseTemplate} />;

  return (
    <LawyerRevizorroSuiteLayout rightPanel={rightPanel}>
      <Link to={paths.settings.workspaces()} className="lawyerRevizorro-suite-back">
        <ArrowLeft size={16} />
        {t("admin.backToWorkspaces")}
      </Link>
      <h1 className="lawyerRevizorro-suite-page-title">{t("admin.createWorkspace")}</h1>

      <div className="lawyerRevizorro-wizard-stepper" role="tablist">
        {WIZARD_STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={step === s.id}
            className={`lawyerRevizorro-wizard-step ${
              step === s.id ? "lawyerRevizorro-wizard-step--active" : step > s.id ? "lawyerRevizorro-wizard-step--done" : ""
            }`}
            onClick={() => goTo(s.id)}
          >
            <span className="lawyerRevizorro-wizard-step__num">{s.id}</span>
            {s.label}
          </button>
        ))}
      </div>

      {step === 1 && (
        <section>
          <label className="lawyerRevizorro-field-label" htmlFor="ws-name">
            {t("admin.fields.workspaceName")}
          </label>
          <input
            id="ws-name"
            className="lawyerRevizorro-carbon-input"
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            placeholder={t("admin.fields.workspaceNamePlaceholder")}
          />
          <p className="lawyerRevizorro-field-hint">{t("admin.fields.workspaceNameHint")}</p>

          <label className="lawyerRevizorro-field-label mt-6 block" htmlFor="ws-desc">
            {t("admin.fields.description")}
          </label>
          <textarea
            id="ws-desc"
            className="lawyerRevizorro-carbon-textarea"
            style={{ minHeight: 100 }}
            value={draft.description}
            onChange={(e) => updateDraft({ description: e.target.value })}
            placeholder={t("admin.fields.descriptionPlaceholder")}
          />

          <label className="lawyerRevizorro-field-label mt-6 block" htmlFor="ws-profile">
            {t("admin.fields.profileType")}
          </label>
          <select
            id="ws-profile"
            className="lawyerRevizorro-carbon-select"
            value={draft.profileType}
            onChange={(e) => handleProfileTypeChange(e.target.value, e.target)}
          >
            {WORKSPACE_MODEL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="lawyerRevizorro-field-hint">{t("admin.fields.profileTypeHint")}</p>
        </section>
      )}

      {step === 2 && (
        <section>
          <label className="lawyerRevizorro-field-label" htmlFor="ws-profile-prompt">
            {t("admin.fields.userProfile")}
          </label>
          <select
            id="ws-profile-prompt"
            className="lawyerRevizorro-carbon-select mb-2"
            value={draft.profileType}
            onChange={(e) => handleProfileTypeChange(e.target.value, e.target)}
          >
            {WORKSPACE_MODEL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="lawyerRevizorro-field-hint mb-4">{t("admin.fields.userProfileHint")}</p>

          <div className="flex items-center gap-2 mb-2">
            <label className="lawyerRevizorro-field-label mb-0" htmlFor="ws-prompt">
              {t("admin.fields.systemInstructions")}
            </label>
            <Info size={16} className="text-theme-text-secondary" aria-hidden />
          </div>
          <p className="lawyerRevizorro-field-hint mb-3">{t("admin.fields.systemInstructionsHint")}</p>
          <textarea
            id="ws-prompt"
            className="lawyerRevizorro-carbon-textarea"
            maxLength={MAX_PROMPT}
            value={draft.openAiPrompt}
            onChange={(e) => updateDraft({ openAiPrompt: e.target.value })}
            placeholder={t("admin.fields.systemInstructionsPlaceholder")}
          />
          <p className="lawyerRevizorro-char-count">
            {draft.openAiPrompt.length}/{MAX_PROMPT}
          </p>

          <label className="lawyerRevizorro-field-label mt-8 block">
            {t("admin.fields.workspaceModels")}
          </label>
          <input
            className="lawyerRevizorro-carbon-input"
            placeholder={t("admin.fields.workspaceModelsPlaceholder")}
            readOnly
            value=""
            onFocus={(e) => e.target.blur()}
          />
          <div className="lawyerRevizorro-chip-row">
            {WORKSPACE_MODEL_PRESETS.map((preset) =>
              draft.modelTags.includes(preset.id) ? (
                <span key={preset.id} className="lawyerRevizorro-chip">
                  <span
                    className="lawyerRevizorro-chip__dot"
                    style={{ background: preset.color }}
                  />
                  {preset.label}
                  <button
                    type="button"
                    className="lawyerRevizorro-chip__remove"
                    onClick={() => toggleModelTag(preset.id)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </span>
              ) : null
            )}
          </div>
          <p className="lawyerRevizorro-field-hint mt-2">
            {t("admin.fields.addModelHint")}{" "}
            {WORKSPACE_MODEL_PRESETS.filter((p) => !draft.modelTags.includes(p.id))
              .slice(0, 3)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="text-primary-button border-none bg-transparent cursor-pointer p-0 ml-1"
                  onClick={() => toggleModelTag(p.id)}
                >
                  + {p.label}
                </button>
              ))}
          </p>

          <div className="lawyerRevizorro-info-banner--blue">
            <Info size={20} className="shrink-0 text-primary-button" />
            <span>{t("admin.visibilityBanner")}</span>
          </div>

          <div className="mt-6">
            <label className="lawyerRevizorro-checkbox-row">
              <input
                type="checkbox"
                checked={draft.suggestActions}
                onChange={(e) => updateDraft({ suggestActions: e.target.checked })}
              />
              <span>
                <span className="lawyerRevizorro-checkbox-row__title">
                  {t("admin.options.suggestActions")}
                </span>
                <span className="lawyerRevizorro-checkbox-row__desc block">
                  {t("admin.options.suggestActionsDesc")}
                </span>
              </span>
            </label>
            <label className="lawyerRevizorro-checkbox-row">
              <input
                type="checkbox"
                checked={draft.contextualMemory}
                onChange={(e) => updateDraft({ contextualMemory: e.target.checked })}
              />
              <span>
                <span className="lawyerRevizorro-checkbox-row__title">
                  {t("admin.options.contextualMemory")}
                </span>
                <span className="lawyerRevizorro-checkbox-row__desc block">
                  {t("admin.options.contextualMemoryDesc")}
                </span>
              </span>
            </label>
            <label className="lawyerRevizorro-checkbox-row">
              <input
                type="checkbox"
                checked={draft.strictMode}
                onChange={(e) => updateDraft({ strictMode: e.target.checked })}
              />
              <span>
                <span className="lawyerRevizorro-checkbox-row__title">
                  {t("admin.options.strictMode")}
                </span>
                <span className="lawyerRevizorro-checkbox-row__desc block">
                  {t("admin.options.strictModeDesc")}
                </span>
              </span>
            </label>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <p className="lawyerRevizorro-field-hint mb-4">{t("admin.documentsIntro")}</p>
          <label className="lawyerRevizorro-field-label" htmlFor="ws-docs">
            {t("admin.fields.documentNotes")}
          </label>
          <textarea
            id="ws-docs"
            className="lawyerRevizorro-carbon-textarea"
            value={draft.documentNotes}
            onChange={(e) => updateDraft({ documentNotes: e.target.value })}
            placeholder={t("admin.fields.documentNotesPlaceholder")}
          />
          <div className="lawyerRevizorro-info-banner--blue mt-4">
            <Info size={20} className="shrink-0 text-primary-button" />
            <span>{t("admin.documentsAfterCreate")}</span>
          </div>
        </section>
      )}

      {step === 4 && (
        <section>
          <p className="lawyerRevizorro-field-hint mb-4">{t("admin.accessIntro")}</p>
          <div className="border border-theme-sidebar-border max-h-[400px] overflow-y-auto">
            {users.length === 0 ? (
              <p className="p-4 text-sm text-theme-text-secondary">{t("admin.noUsers")}</p>
            ) : (
              users.map((u) => (
                <label
                  key={u.id}
                  className="lawyerRevizorro-checkbox-row px-4 cursor-pointer hover:bg-theme-sidebar-item-hover"
                >
                  <input
                    type="checkbox"
                    checked={draft.userIds.includes(u.id)}
                    onChange={() => toggleUser(u.id)}
                  />
                  <span>
                    <span className="lawyerRevizorro-checkbox-row__title">
                      {u.username || `user #${u.id}`}
                    </span>
                    <span className="lawyerRevizorro-checkbox-row__desc block">{u.role}</span>
                  </span>
                </label>
              ))
            )}
          </div>
          <p className="lawyerRevizorro-field-hint mt-3">{t("admin.accessHint")}</p>
        </section>
      )}

      {step === 5 && (
        <section className="lawyerRevizorro-summary-grid">
          <p className="text-theme-text-secondary text-sm mb-4">{t("admin.summaryIntro")}</p>
          <dl>
            <div className="lawyerRevizorro-summary-row">
              <dt>{t("admin.fields.workspaceName")}</dt>
              <dd>{draft.name || "—"}</dd>
            </div>
            <div className="lawyerRevizorro-summary-row">
              <dt>{t("admin.fields.profileType")}</dt>
              <dd>
                {WORKSPACE_MODEL_PRESETS.find((p) => p.id === draft.profileType)?.label ??
                  draft.profileType}
              </dd>
            </div>
            <div className="lawyerRevizorro-summary-row">
              <dt>{t("admin.fields.systemInstructions")}</dt>
              <dd className="truncate max-w-md">
                {draft.openAiPrompt?.slice(0, 120) || "—"}
                {draft.openAiPrompt?.length > 120 ? "…" : ""}
              </dd>
            </div>
            <div className="lawyerRevizorro-summary-row">
              <dt>{t("admin.fields.workspaceModels")}</dt>
              <dd>{draft.modelTags.join(", ") || "—"}</dd>
            </div>
            <div className="lawyerRevizorro-summary-row">
              <dt>{t("admin.summaryMembers")}</dt>
              <dd>{draft.userIds.length} {t("admin.usersSelected")}</dd>
            </div>
          </dl>
        </section>
      )}

      <div className="lawyerRevizorro-wizard-footer">
        {step > 1 && (
          <button type="button" className="lawyerRevizorro-btn-ghost" onClick={() => goTo(step - 1)}>
            {t("admin.previous")}
          </button>
        )}
        {step < 5 ? (
          <button
            type="button"
            className="lawyerRevizorro-btn-new-chat"
            style={{ width: "auto", minWidth: 120 }}
            onClick={() => goTo(step + 1)}
          >
            {t("admin.next")}
          </button>
        ) : (
          <button
            type="button"
            className="lawyerRevizorro-btn-new-chat"
            style={{ width: "auto", minWidth: 160 }}
            disabled={submitting}
            onClick={handleCreate}
          >
            {submitting ? t("admin.creating") : t("admin.createWorkspaceBtn")}
          </button>
        )}
      </div>
    </LawyerRevizorroSuiteLayout>
  );
}
