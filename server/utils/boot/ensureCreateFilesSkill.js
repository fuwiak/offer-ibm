const { SystemSettings } = require("../../models/systemSettings");
const { safeJsonParse } = require("../http");

const REQUIRED_SKILLS = ["create-files-agent"];

/**
 * Ensures that the create-files-agent skill is always in default_agent_skills.
 * Runs on every boot so Railway and other non-Docker deployments have it enabled.
 */
async function ensureCreateFilesSkillEnabled() {
  try {
    const current = safeJsonParse(
      await SystemSettings.getValueOrFallback({ label: "default_agent_skills" }, "[]"),
      []
    );

    const missing = REQUIRED_SKILLS.filter((s) => !current.includes(s));
    if (missing.length === 0) return;

    const updated = [...new Set([...current, ...missing])];
    await SystemSettings.updateSettings({
      default_agent_skills: JSON.stringify(updated),
    });
    console.log(
      `[lawyerRevizorro] Enabled agent skills: ${missing.join(", ")}`
    );
  } catch (e) {
    console.error("[lawyerRevizorro] ensureCreateFilesSkillEnabled error:", e.message);
  }
}

module.exports = { ensureCreateFilesSkillEnabled };
