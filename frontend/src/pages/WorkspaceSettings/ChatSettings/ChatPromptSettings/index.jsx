import { useEffect, useState, useRef, Fragment } from "react";
import { getWorkspaceSystemPrompt } from "@/utils/chat";
import { useTranslation } from "react-i18next";
import SystemPromptVariable from "@/models/systemPromptVariable";
import Highlighter from "react-highlight-words";
import { Link, useSearchParams } from "react-router-dom";
import paths from "@/utils/paths";
import ChatPromptHistory from "./ChatPromptHistory";
import PublishEntityModal from "@/components/CommunityHub/PublishEntityModal";
import { useModal } from "@/hooks/useModal";
import System from "@/models/system";
import { LAWYER_REVIZORRO_BOT_PROFILES } from "@/config/lawyerRevizorroBotProfilePrompts";
import { resolveProfilePromptChange } from "@/utils/lawyerRevizorro/workspaceProfilePrompt";

export default function ChatPromptSettings({
  workspace,
  setHasChanges,
  hasChanges,
}) {
  const { t } = useTranslation();
  const { t: tLawyerRevizorro } = useTranslation("lawyerRevizorro");
  const [searchParams] = useSearchParams();

  const initialPrompt = getWorkspaceSystemPrompt(workspace);
  const initialProfile = workspace?.lawyerRevizorroUserProfile || "";

  const [prompt, setPrompt] = useState(initialPrompt);
  const [savedPrompt, setSavedPrompt] = useState(initialPrompt);
  const [userProfile, setUserProfile] = useState(initialProfile);
  const [savedProfile, setSavedProfile] = useState(initialProfile);
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [showPromptHistory, setShowPromptHistory] = useState(false);
  const [availableVariables, setAvailableVariables] = useState([]);

  const promptRef = useRef(null);
  const promptHistoryRef = useRef(null);
  const historyButtonRef = useRef(null);

  const {
    isOpen: showPublishModal,
    closeModal: closePublishModal,
    openModal: openPublishModal,
  } = useModal();

  const isDirty =
    prompt !== savedPrompt || userProfile !== savedProfile;
  const hasBeenModified =
    savedPrompt?.trim() !== initialPrompt?.trim() ||
    savedProfile !== initialProfile;
  const showPublishButton =
    !isEditing && prompt?.trim().length >= 10 && (isDirty || hasBeenModified);

  useEffect(() => {
    async function setupVariableHighlighting() {
      const { variables } = await SystemPromptVariable.getAll();
      setAvailableVariables(variables);
    }
    setupVariableHighlighting();
    if (searchParams.get("action") === "focus-system-prompt") setIsEditing(true);
  }, [searchParams]);

  useEffect(() => {
    if (!hasChanges) {
      setSavedPrompt(prompt);
      setSavedProfile(userProfile);
    }
  }, [hasChanges, prompt, userProfile]);

  useEffect(() => {
    if (isEditing && promptRef.current) {
      promptRef.current.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    System.fetchDefaultSystemPrompt().then(({ defaultSystemPrompt }) =>
      setDefaultSystemPrompt(defaultSystemPrompt)
    );
  }, []);

  useEffect(() => {
    const p = getWorkspaceSystemPrompt(workspace);
    setPrompt(p);
    setSavedPrompt(p);
    const profile = workspace?.lawyerRevizorroUserProfile || "";
    setUserProfile(profile);
    setSavedProfile(profile);
  }, [workspace?.slug, workspace?.openAiPrompt, workspace?.lawyerRevizorroUserProfile]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        promptHistoryRef.current &&
        !promptHistoryRef.current.contains(event.target) &&
        historyButtonRef.current &&
        !historyButtonRef.current.contains(event.target)
      ) {
        setShowPromptHistory(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleProfileChange(e) {
    const newProfile = e.target.value;
    if (!newProfile) {
      setUserProfile("");
      setHasChanges(true);
      return;
    }

    const { apply, nextPrompt } = resolveProfilePromptChange(
      userProfile,
      prompt,
      newProfile,
      tLawyerRevizorro
    );
    if (!apply) {
      e.target.value = userProfile;
      return;
    }

    setUserProfile(newProfile);
    setPrompt(nextPrompt);
    setHasChanges(true);
    setIsEditing(true);
  }

  const handleRestoreFromHistory = (historicalPrompt) => {
    setPrompt(historicalPrompt);
    setShowPromptHistory(false);
    setHasChanges(true);
  };

  const handlePublishFromHistory = (historicalPrompt) => {
    openPublishModal();
    setShowPromptHistory(false);
    setTimeout(() => setPrompt(historicalPrompt), 0);
  };

  const handleRestoreToDefaultSystemPrompt = () => {
    System.fetchDefaultSystemPrompt().then(({ defaultSystemPrompt }) => {
      setPrompt(defaultSystemPrompt);
      setHasChanges(true);
    });
  };

  return (
    <>
      <ChatPromptHistory
        ref={promptHistoryRef}
        workspaceSlug={workspace.slug}
        show={showPromptHistory}
        onRestore={handleRestoreFromHistory}
        onPublishClick={handlePublishFromHistory}
        onClose={() => setShowPromptHistory(false)}
      />
      <div>
        <div className="flex flex-col">
          <label htmlFor="lawyerRevizorro-user-profile" className="block input-label">
            {tLawyerRevizorro("admin.fields.userProfile")}
          </label>
          <p className="text-white text-opacity-60 text-xs font-medium py-1.5">
            {tLawyerRevizorro("admin.fields.userProfileHint")}
          </p>
          <select
            id="lawyerRevizorro-user-profile"
            name="lawyerRevizorroUserProfile"
            value={userProfile}
            onChange={handleProfileChange}
            className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5 mt-1 mb-4"
          >
            <option value="">{tLawyerRevizorro("admin.fields.userProfilePlaceholder")}</option>
            {LAWYER_REVIZORRO_BOT_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          <div className="flex items-center justify-between">
            <label htmlFor="name" className="block input-label">
              {t("chat.prompt.title")}
            </label>
          </div>
          <p className="text-white text-opacity-60 text-xs font-medium py-1.5">
            {t("chat.prompt.description")}
          </p>
          <p className="text-white text-opacity-60 text-xs font-medium mb-2">
            You can insert{" "}
            <Link
              to={paths.settings.systemPromptVariables()}
              className="text-primary-button"
            >
              prompt variables
            </Link>{" "}
            like:{" "}
            {availableVariables.slice(0, 3).map((v, i) => (
              <Fragment key={v.key}>
                <span className="bg-theme-settings-input-bg px-1 py-0.5 rounded">
                  {`{${v.key}}`}
                </span>
                {i < availableVariables.length - 1 && ", "}
              </Fragment>
            ))}
            {availableVariables.length > 3 && (
              <Link
                to={paths.settings.systemPromptVariables()}
                className="text-primary-button"
              >
                +{availableVariables.length - 3} more...
              </Link>
            )}
          </p>
        </div>

        <input type="hidden" name="openAiPrompt" value={prompt} />
        <div className="relative w-full flex flex-col items-end">
          <button
            ref={historyButtonRef}
            type="button"
            className="text-theme-text-secondary hover:text-white light:hover:text-black text-xs font-medium"
            onClick={(e) => {
              e.preventDefault();
              setShowPromptHistory(!showPromptHistory);
            }}
          >
            {showPromptHistory ? "Hide History" : "View History"}
          </button>
          <div className="relative w-full">
            {isEditing ? (
              <textarea
                ref={promptRef}
                autoFocus={true}
                rows={12}
                value={prompt}
                onFocus={(e) => {
                  const length = e.target.value.length;
                  e.target.setSelectionRange(length, length);
                }}
                onBlur={(e) => {
                  setIsEditing(false);
                  setPrompt(e.target.value);
                }}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setHasChanges(true);
                }}
                style={{
                  resize: "vertical",
                  overflowY: "scroll",
                  minHeight: "200px",
                }}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5 mt-2"
              />
            ) : (
              <div
                onClick={() => setIsEditing(true)}
                style={{
                  resize: "vertical",
                  overflowY: "scroll",
                  minHeight: "200px",
                }}
                className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5 mt-2"
              >
                <Highlighter
                  className="whitespace-pre-wrap"
                  highlightClassName="bg-cta-button p-0.5 rounded-md"
                  searchWords={availableVariables.map((v) => `{${v.key}}`)}
                  autoEscape={true}
                  caseSensitive={true}
                  textToHighlight={prompt}
                />
              </div>
            )}
          </div>
          <div className="w-full flex flex-row items-center justify-between pt-2">
            {prompt !== defaultSystemPrompt && (
              <button
                type="button"
                onClick={handleRestoreToDefaultSystemPrompt}
                className="text-theme-text-primary hover:text-white light:hover:text-black text-xs font-medium"
              >
                Restore to Default
              </button>
            )}
            <PublishPromptCTA
              hidden={!showPublishButton}
              onClick={openPublishModal}
            />
          </div>
        </div>
      </div>
      <PublishEntityModal
        show={showPublishModal}
        onClose={closePublishModal}
        entityType="system-prompt"
        entity={prompt}
      />
    </>
  );
}

function PublishPromptCTA({ hidden = false, onClick }) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-none text-primary-button hover:text-white light:hover:text-black text-xs font-medium"
    >
      Publish to Community Hub
    </button>
  );
}
