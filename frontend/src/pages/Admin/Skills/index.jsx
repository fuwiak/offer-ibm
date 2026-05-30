import { useEffect, useState } from "react";
import SettingsSidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import Admin from "@/models/admin";
import showToast from "@/utils/toast";
import { Plus, Pencil, Trash, X, Lightning } from "@phosphor-icons/react";
import ModalWrapper from "@/components/ModalWrapper";

const CMD_REGEX = /[^a-zA-Z0-9_-]/g;

export default function AdminSkills() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSkill, setEditingSkill] = useState(null);

  useEffect(() => {
    Admin.getSystemSkills().then((data) => {
      setSkills(data);
      setLoading(false);
    });
  }, []);

  const handleCreate = async (skillData) => {
    const { skill, error } = await Admin.createSystemSkill(skillData);
    if (error) {
      showToast(error, "error", { clear: true });
      return false;
    }
    setSkills((prev) => [...prev, skill]);
    setShowAddModal(false);
    showToast("Skill created successfully.", "success", { clear: true });
    return true;
  };

  const handleUpdate = async (skillData) => {
    const { skill, error } = await Admin.updateSystemSkill(editingSkill.id, skillData);
    if (error) {
      showToast(error, "error", { clear: true });
      return;
    }
    setSkills((prev) => prev.map((s) => (s.id === editingSkill.id ? skill : s)));
    setEditingSkill(null);
    showToast("Skill updated.", "success", { clear: true });
  };

  const handleDelete = async (skillId) => {
    if (!window.confirm("Delete this skill? All users will lose access to it.")) return;
    const ok = await Admin.deleteSystemSkill(skillId);
    if (!ok) {
      showToast("Failed to delete skill.", "error", { clear: true });
      return;
    }
    setSkills((prev) => prev.filter((s) => s.id !== skillId));
    showToast("Skill deleted.", "success", { clear: true });
  };

  return (
    <div
      id="admin-skills-container"
      className="w-screen h-screen overflow-hidden bg-theme-bg-container flex md:mt-0 mt-6"
    >
      <SettingsSidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-x-3">
            <Lightning size={28} className="text-theme-text-primary" weight="fill" />
            <div>
              <h1 className="text-xl font-semibold text-theme-text-primary">Skills</h1>
              <p className="text-sm text-theme-text-secondary mt-0.5">
                Manage system-wide slash command skills available to all users.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-x-2 bg-cta-button hover:opacity-80 transition-opacity text-white text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={16} weight="bold" />
            Add Skill
          </button>
        </div>

        {/* Skill list */}
        {loading ? (
          <SkeletonList />
        ) : skills.length === 0 ? (
          <EmptyState onAdd={() => setShowAddModal(true)} />
        ) : (
          <div className="flex flex-col gap-y-2">
            {skills.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                onEdit={() => setEditingSkill(skill)}
                onDelete={() => handleDelete(skill.id)}
              />
            ))}
          </div>
        )}

        {/* Add modal */}
        <SkillFormModal
          isOpen={showAddModal}
          title="Add Skill"
          onClose={() => setShowAddModal(false)}
          onSave={handleCreate}
        />

        {/* Edit modal */}
        {editingSkill && (
          <SkillFormModal
            isOpen={!!editingSkill}
            title="Edit Skill"
            preset={editingSkill}
            onClose={() => setEditingSkill(null)}
            onSave={handleUpdate}
            onDelete={() => handleDelete(editingSkill.id)}
          />
        )}
      </div>
    </div>
  );
}

function SkillRow({ skill, onEdit, onDelete }) {
  return (
    <div className="flex items-center justify-between bg-theme-bg-primary rounded-xl px-4 py-3 hover:bg-white/5 transition-colors group">
      <div className="flex flex-col gap-y-0.5 min-w-0">
        <span className="text-sm font-medium text-theme-text-primary font-mono">
          {skill.command}
        </span>
        <span className="text-xs text-theme-text-secondary truncate">
          {skill.description}
        </span>
      </div>
      <div className="flex items-center gap-x-1 shrink-0 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-theme-text-secondary hover:text-white hover:bg-white/10 transition-colors"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-theme-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash size={16} />
        </button>
      </div>
    </div>
  );
}

function SkillFormModal({ isOpen, title, preset = null, onClose, onSave, onDelete }) {
  const [command, setCommand] = useState(preset?.command?.slice(1) ?? "");

  useEffect(() => {
    if (isOpen) setCommand(preset?.command?.slice(1) ?? "");
  }, [isOpen, preset]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const sanitized = command.replace(CMD_REGEX, "");
    await onSave({
      command: `/${sanitized}`,
      prompt: form.get("prompt"),
      description: form.get("description"),
    });
  };

  const inputClass =
    "border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5";

  return (
    <ModalWrapper isOpen={isOpen}>
      <div className="w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border overflow-hidden">
        <div className="relative p-6 border-b rounded-t border-theme-modal-border">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            type="button"
            className="absolute top-4 right-4 transition-all duration-300 bg-transparent rounded-lg text-sm p-1 inline-flex items-center hover:bg-theme-modal-border border-transparent border"
          >
            <X size={24} weight="bold" className="text-white" />
          </button>
        </div>

        <div className="h-full w-full overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
          <form onSubmit={handleSubmit}>
            <div className="py-7 px-9 space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-white">Command</label>
                <div className="flex items-center">
                  <span className="text-white text-sm mr-2 font-bold">/</span>
                  <input
                    name="command"
                    type="text"
                    placeholder="your-skill-name"
                    value={command}
                    onChange={(e) => setCommand(e.target.value.replace(CMD_REGEX, ""))}
                    maxLength={25}
                    autoComplete="off"
                    required
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-white">Prompt</label>
                <textarea
                  name="prompt"
                  placeholder="The instructions the AI will follow when this skill is invoked..."
                  defaultValue={preset?.prompt ?? ""}
                  required
                  rows={5}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-white">Description</label>
                <input
                  type="text"
                  name="description"
                  placeholder="Short description shown in the slash commands menu"
                  defaultValue={preset?.description ?? ""}
                  maxLength={80}
                  autoComplete="off"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex w-full justify-between items-center p-6 space-x-2 border-t border-theme-modal-border rounded-b">
              <div>
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="border-none transition-all duration-300 bg-transparent text-red-400 hover:bg-red-500/20 px-4 py-2 rounded-lg text-sm"
                  >
                    Delete Skill
                  </button>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={onClose}
                  type="button"
                  className="border-none transition-all duration-300 bg-transparent text-white hover:opacity-60 px-4 py-2 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="transition-all duration-300 bg-white text-black hover:opacity-60 px-4 py-2 rounded-lg text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ModalWrapper>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-y-3">
      <Lightning size={40} className="text-theme-text-secondary" weight="duotone" />
      <p className="text-theme-text-primary font-medium">No skills yet</p>
      <p className="text-theme-text-secondary text-sm max-w-xs">
        Create skills that appear as slash commands for all users. Invoke them with{" "}
        <span className="font-mono">/skill-name</span> in any chat.
      </p>
      <button
        onClick={onAdd}
        className="mt-2 flex items-center gap-x-2 bg-cta-button hover:opacity-80 transition-opacity text-white text-sm px-4 py-2 rounded-lg"
      >
        <Plus size={16} weight="bold" />
        Add your first skill
      </button>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col gap-y-2">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-theme-bg-primary rounded-xl px-4 py-3 h-14 animate-pulse" />
      ))}
    </div>
  );
}
