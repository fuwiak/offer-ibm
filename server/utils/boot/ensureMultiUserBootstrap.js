const { v4 } = require("uuid");
const { SystemSettings } = require("../../models/systemSettings");
const { User } = require("../../models/user");
const {
  BrowserExtensionApiKey,
} = require("../../models/browserExtensionApiKey");
const { AgentSkillWhitelist } = require("../../models/agentSkillWhitelist");

async function ensureMultiUserBootstrap() {
  let userCount = 0;
  try {
    userCount = await User.count();
  } catch (e) {
    console.error("[BOOT] User.count() failed:", e.message);
  }

  console.log(
    `[BOOT] users in DB: ${userCount} | MULTI_USER_BOOTSTRAP=${
      process.env.MULTI_USER_MODE_BOOTSTRAP || "unset"
    } | BOOTSTRAP_PASSWORD set: ${!!(
      process.env.MULTI_USER_BOOTSTRAP_PASSWORD ||
      process.env.INITIAL_ADMIN_PASSWORD
    )}`
  );

  if (userCount > 0) return;

  const adminUsername = String(
    process.env.MULTI_USER_BOOTSTRAP_USERNAME || "admin"
  )
    .trim()
    .toLowerCase();
  const adminPassword = String(
    process.env.MULTI_USER_BOOTSTRAP_PASSWORD ||
      process.env.INITIAL_ADMIN_PASSWORD ||
      ""
  ).trim();

  if (!adminPassword) {
    console.warn(
      "[BOOT] No users in database and no bootstrap password set. Open /first-run to create admin, or set MULTI_USER_BOOTSTRAP_PASSWORD (or INITIAL_ADMIN_PASSWORD)."
    );
    return;
  }

  if (adminPassword.length < 8) {
    console.error(
      `[BOOT] Bootstrap password must be at least 8 characters (got ${adminPassword.length}). Skipping.`
    );
    return;
  }

  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = v4();
    console.log(
      "[BOOT] JWT_SECRET was unset — generated in-memory for this boot. Set it on the server for persistence."
    );
  }

  try {
    const prisma = require("../prisma");
    const bcrypt = require("bcryptjs");
    const hashedPassword = bcrypt.hashSync(adminPassword, 10);

    const user = await prisma.users.create({
      data: {
        username: adminUsername,
        password: hashedPassword,
        role: "admin",
        bio: "",
      },
    });

    await SystemSettings._updateSettings({ multi_user_mode: true });

    try {
      await BrowserExtensionApiKey.migrateApiKeysToMultiUser(user.id);
      await AgentSkillWhitelist.clearSingleUserWhitelist();
    } catch (migrateError) {
      console.warn(
        "[BOOT] Post-create migration warning:",
        migrateError.message
      );
    }

    console.log(
      `[BOOT] Bootstrap admin "${adminUsername}" created (id=${user.id}). Multi-user mode enabled.`
    );
  } catch (e) {
    console.error("[BOOT] Failed to create bootstrap admin:", e.message);
    if (
      String(e.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      console.error(
        `[BOOT] Username "${adminUsername}" already exists with a different password. Either delete it from DB or change MULTI_USER_BOOTSTRAP_USERNAME.`
      );
    }
  }
}

module.exports = { ensureMultiUserBootstrap };
