const { ApiKey } = require("../models/apiKeys");
const { BrowserExtensionApiKey } = require("../models/browserExtensionApiKey");
const { Document } = require("../models/documents");
const { EventLogs } = require("../models/eventLogs");
const { Invite } = require("../models/invite");
const { SystemSettings } = require("../models/systemSettings");
const { User } = require("../models/user");
const { DocumentVectors } = require("../models/vectors");
const { Workspace } = require("../models/workspace");
const { WorkspaceUser } = require("../models/workspaceUsers");
const { WorkspaceChats } = require("../models/workspaceChats");
const { SlashCommandPresets } = require("../models/slashCommandsPresets");
const {
  getVectorDbClass,
  getEmbeddingEngineSelection,
} = require("../utils/helpers");
const {
  validRoleSelection,
  canModifyAdmin,
  validCanModify,
} = require("../utils/helpers/admin");
const { reqBody, userFromSession, safeJsonParse } = require("../utils/http");
const {
  strictMultiUserRoleValid,
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const ImportedPlugin = require("../utils/agents/imported");
const {
  simpleSSOLoginDisabledMiddleware,
} = require("../utils/middleware/simpleSSOEnabled");
const prisma = require("../utils/prisma");
const {
  canManagerDeleteWorkspace,
  canUserManageWorkspaceMembers,
  filterWorkspacesForUser,
} = require("../utils/lawyerRevizorro/workspaceVisibility");

async function loadWorkspaceForAccess(workspaceId) {
  return prisma.workspaces.findFirst({
    where: { id: Number(workspaceId) },
    include: { workspace_users: true },
  });
}

async function requireWorkspaceManageAccess(user, workspaceId, response) {
  const workspace = await loadWorkspaceForAccess(workspaceId);
  if (!workspace) {
    response.status(404).json({ success: false, error: "Workspace not found." });
    return null;
  }
  if (!canUserManageWorkspaceMembers(user, workspace)) {
    response.status(403).json({ success: false, error: "Access denied." });
    return null;
  }
  return workspace;
}

function adminEndpoints(app) {
  if (!app) return;

  app.get(
    "/admin/users",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const users = await User.where();
        response.status(200).json({ users });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/users/new",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const currUser = await userFromSession(request, response);
        const newUserParams = reqBody(request);
        const roleValidation = validRoleSelection(currUser, newUserParams);

        if (!roleValidation.valid) {
          response
            .status(200)
            .json({ user: null, error: roleValidation.error });
          return;
        }

        const { user: newUser, error } = await User.create(newUserParams);
        if (!!newUser) {
          await EventLogs.logEvent(
            "user_created",
            {
              userName: newUser.username,
              createdBy: currUser.username,
            },
            currUser.id
          );
        }

        response.status(200).json({ user: newUser, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/user/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const currUser = await userFromSession(request, response);
        const { id } = request.params;
        const updates = reqBody(request);
        const user = await User.get({ id: Number(id) });

        const canModify = validCanModify(currUser, user);
        if (!canModify.valid) {
          response.status(200).json({ success: false, error: canModify.error });
          return;
        }

        const roleValidation = validRoleSelection(currUser, updates);
        if (!roleValidation.valid) {
          response
            .status(200)
            .json({ success: false, error: roleValidation.error });
          return;
        }

        const validAdminRoleModification = await canModifyAdmin(user, updates);
        if (!validAdminRoleModification.valid) {
          response
            .status(200)
            .json({ success: false, error: validAdminRoleModification.error });
          return;
        }

        const { success, error } = await User.update(id, updates);
        response.status(200).json({ success, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/user/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const currUser = await userFromSession(request, response);
        const { id } = request.params;
        const user = await User.get({ id: Number(id) });

        const canModify = validCanModify(currUser, user);
        if (!canModify.valid) {
          response.status(200).json({ success: false, error: canModify.error });
          return;
        }

        await BrowserExtensionApiKey.deleteAllForUser(Number(id));
        await User.delete({ id: Number(id) });
        await EventLogs.logEvent(
          "user_deleted",
          {
            userName: user.username,
            deletedBy: currUser.username,
          },
          currUser.id
        );
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/invites",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (_request, response) => {
      try {
        const invites = await Invite.whereWithUsers();
        response.status(200).json({ invites });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/invite/new",
    [
      validatedRequest,
      strictMultiUserRoleValid([ROLES.admin, ROLES.manager]),
      simpleSSOLoginDisabledMiddleware,
    ],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const body = reqBody(request);
        const { invite, error } = await Invite.create({
          createdByUserId: user.id,
          workspaceIds: body?.workspaceIds || [],
        });

        await EventLogs.logEvent(
          "invite_created",
          {
            inviteCode: invite.code,
            createdBy: response.locals?.user?.username,
          },
          response.locals?.user?.id
        );
        response.status(200).json({ invite, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/invite/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { id } = request.params;
        const { success, error } = await Invite.deactivate(id);
        await EventLogs.logEvent(
          "invite_deleted",
          { deletedBy: response.locals?.user?.username },
          response.locals?.user?.id
        );
        response.status(200).json({ success, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/workspaces",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const all = await Workspace.whereWithUsers();
        const workspaces =
          user?.role === ROLES.admin
            ? all
            : filterWorkspacesForUser(user, all);
        response.status(200).json({ workspaces });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/workspaces/:workspaceId/users",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { workspaceId } = request.params;
        if (!(await requireWorkspaceManageAccess(user, workspaceId, response)))
          return;
        const users = await Workspace.workspaceUsers(workspaceId);
        response.status(200).json({ users });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/workspaces/new",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { name } = reqBody(request);
        const { workspace, message: error } = await Workspace.new(
          name,
          user.id
        );
        response.status(200).json({ workspace, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/workspaces/:workspaceId/update-users",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { workspaceId } = request.params;
        if (!(await requireWorkspaceManageAccess(user, workspaceId, response)))
          return;
        const { userIds } = reqBody(request);
        const { success, error } = await Workspace.updateUsers(
          workspaceId,
          userIds
        );
        response.status(200).json({ success, error });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/workspaces/:workspaceId/users",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { workspaceId } = request.params;
        if (!(await requireWorkspaceManageAccess(user, workspaceId, response)))
          return;
        const { userId } = reqBody(request);
        const id = Number(userId);
        if (!id) {
          response
            .status(400)
            .json({ success: false, error: "userId is required." });
          return;
        }
        const existing = await WorkspaceUser.get({
          workspace_id: Number(workspaceId),
          user_id: id,
        });
        if (existing) {
          response.status(200).json({ success: true, error: null });
          return;
        }
        await WorkspaceUser.create(id, Number(workspaceId));
        response.status(200).json({
          success: true,
          error: null,
          users: await Workspace.workspaceUsers(workspaceId),
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/workspaces/:workspaceId/users/:userId",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { workspaceId, userId } = request.params;
        if (!(await requireWorkspaceManageAccess(user, workspaceId, response)))
          return;
        await WorkspaceUser.delete({
          workspace_id: Number(workspaceId),
          user_id: Number(userId),
        });
        response.status(200).json({
          success: true,
          error: null,
          users: await Workspace.workspaceUsers(workspaceId),
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/workspaces/:workspaceId/users/:userId/membership",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { workspaceId, userId } = request.params;
        if (!(await requireWorkspaceManageAccess(user, workspaceId, response)))
          return;
        const { suspended } = reqBody(request);
        const membership = await WorkspaceUser.get({
          workspace_id: Number(workspaceId),
          user_id: Number(userId),
        });
        if (!membership) {
          response
            .status(404)
            .json({ success: false, error: "User is not in this workspace." });
          return;
        }
        const { success, error } = await WorkspaceUser.update(
          {
            workspace_id: Number(workspaceId),
            user_id: Number(userId),
          },
          { suspended: suspended ? 1 : 0 }
        );
        response.status(200).json({
          success,
          error,
          users: await Workspace.workspaceUsers(workspaceId),
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/workspaces/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { id } = request.params;
        const VectorDb = getVectorDbClass();
        const workspace = await loadWorkspaceForAccess(id);
        if (!workspace) {
          response.sendStatus(404).end();
          return;
        }
        if (!canManagerDeleteWorkspace(user, workspace)) {
          response
            .status(403)
            .json({
              success: false,
              error: "Managers can only delete workspaces they created.",
            });
          return;
        }

        await WorkspaceChats.delete({ workspaceId: Number(workspace.id) });
        await DocumentVectors.deleteForWorkspace(Number(workspace.id));
        await Document.delete({ workspaceId: Number(workspace.id) });
        await Workspace.delete({ id: Number(workspace.id) });
        try {
          await VectorDb["delete-namespace"]({ namespace: workspace.slug });
        } catch (e) {
          console.error(e.message);
        }

        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  // System preferences but only by array of labels
  app.get(
    "/admin/system-preferences-for",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const requestedSettings = {};
        const labels = request.query.labels?.split(",") || [];
        const needEmbedder = [
          "text_splitter_chunk_size",
          "max_embed_chunk_size",
        ];
        const noRecord = [
          "max_embed_chunk_size",
          "agent_sql_connections",
          "imported_agent_skills",
          "feature_flags",
          "meta_page_title",
          "meta_page_favicon",
        ];

        // Managers can only read a limited set of settings.
        // These match the ManagerRoute pages in the frontend.
        const managerAllowedFields = [
          "custom_app_name",
          "footer_data",
          "support_email",
          "meta_page_title",
          "meta_page_favicon",
        ];

        for (const label of labels) {
          // Skip any settings that are not explicitly defined as public
          if (!SystemSettings.publicFields.includes(label)) continue;

          // Managers can only read manager-allowed fields
          if (
            user?.role === ROLES.manager &&
            !managerAllowedFields.includes(label)
          )
            continue;

          // Only get the embedder if the setting actually needs it
          let embedder = needEmbedder.includes(label)
            ? getEmbeddingEngineSelection()
            : null;
          // Only get the record from db if the setting actually needs it
          let setting = noRecord.includes(label)
            ? null
            : await SystemSettings.get({ label });

          switch (label) {
            case "footer_data":
              requestedSettings[label] = setting?.value ?? JSON.stringify([]);
              break;
            case "support_email":
              requestedSettings[label] = setting?.value || null;
              break;
            case "text_splitter_chunk_size":
              requestedSettings[label] =
                setting?.value || embedder?.embeddingMaxChunkLength || null;
              break;
            case "text_splitter_chunk_overlap":
              requestedSettings[label] = setting?.value || null;
              break;
            case "max_embed_chunk_size":
              requestedSettings[label] =
                embedder?.embeddingMaxChunkLength || 1000;
              break;
            case "agent_search_provider":
              requestedSettings[label] = setting?.value || null;
              break;
            case "agent_sql_connections":
              requestedSettings[label] =
                await SystemSettings.agent_sql_connections();
              break;
            case "default_agent_skills":
              requestedSettings[label] = safeJsonParse(setting?.value, []);
              break;
            case "disabled_agent_skills":
              requestedSettings[label] = safeJsonParse(setting?.value, []);
              break;
            case "disabled_filesystem_skills":
              requestedSettings[label] = safeJsonParse(setting?.value, []);
              break;
            case "disabled_create_files_skills":
              requestedSettings[label] = safeJsonParse(setting?.value, []);
              break;
            case "disabled_gmail_skills":
              requestedSettings[label] = safeJsonParse(setting?.value, []);
              break;
            case "disabled_outlook_skills":
              requestedSettings[label] = safeJsonParse(setting?.value, []);
              break;
            case "imported_agent_skills":
              requestedSettings[label] = ImportedPlugin.listImportedPlugins();
              break;
            case "custom_app_name":
              requestedSettings[label] = setting?.value || null;
              break;
            case "feature_flags":
              requestedSettings[label] =
                (await SystemSettings.getFeatureFlags()) || {};
              break;
            case "meta_page_title":
              requestedSettings[label] =
                await SystemSettings.getValueOrFallback({ label }, null);
              break;
            case "meta_page_favicon":
              requestedSettings[label] =
                await SystemSettings.getValueOrFallback({ label }, null);
              break;
            default:
              break;
          }
        }

        response.status(200).json({ settings: requestedSettings });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/system-preferences",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        let updates = reqBody(request);

        // Managers can only update a limited set of settings.
        // These match the ManagerRoute pages in the frontend.
        // Admin users can update all supportedFields without restriction.
        if (user?.role === ROLES.manager) {
          const managerAllowedFields = [
            "custom_app_name",
            "footer_data",
            "support_email",
            "meta_page_title",
            "meta_page_favicon",
          ];
          const filteredUpdates = {};
          for (const key of Object.keys(updates)) {
            if (managerAllowedFields.includes(key)) {
              filteredUpdates[key] = updates[key];
            }
          }
          updates = filteredUpdates;
        }

        await SystemSettings.updateSettings(updates);
        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/api-keys",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const apiKeys = await ApiKey.whereWithUser({});
        return response.status(200).json({
          apiKeys,
          error: null,
        });
      } catch (error) {
        console.error(error);
        response.status(500).json({
          apiKey: null,
          error: "Could not find an API Keys.",
        });
      }
    }
  );

  app.post(
    "/admin/generate-api-key",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const { name = null } = reqBody(request);
        const { apiKey, error } = await ApiKey.create(user.id, name);
        await EventLogs.logEvent(
          "api_key_created",
          { createdBy: user?.username, name: apiKey?.name },
          user?.id
        );
        return response.status(200).json({
          apiKey,
          error,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/delete-api-key/:id",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { id } = request.params;
        if (!id || isNaN(Number(id))) return response.sendStatus(400).end();
        await ApiKey.delete({ id: Number(id) });

        await EventLogs.logEvent(
          "api_key_deleted",
          { deletedBy: response.locals?.user?.username },
          response?.locals?.user?.id
        );
        return response.status(200).end();
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
  // ── Admin-managed system skills (slash command presets for all users) ──

  app.get(
    "/admin/system-skills",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      try {
        const skills = await SlashCommandPresets.getSystemSkills();
        response.status(200).json({ skills });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/system-skills",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { command, prompt, description } = reqBody(request);
        if (!command || !prompt || !description)
          return response.status(400).json({ message: "command, prompt, and description are required." });

        const formattedCommand = SlashCommandPresets.formatCommand(String(command));
        const skill = await SlashCommandPresets.createSystemSkill({
          command: formattedCommand,
          prompt: String(prompt),
          description: String(description),
        });
        if (!skill)
          return response.status(500).json({ message: "Failed to create skill." });
        response.status(201).json({ skill });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/system-skills/:skillId",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { skillId } = request.params;
        const { command, prompt, description } = reqBody(request);
        if (!command || !prompt || !description)
          return response.status(400).json({ message: "command, prompt, and description are required." });

        const formattedCommand = SlashCommandPresets.formatCommand(String(command));
        const skill = await SlashCommandPresets.updateSystemSkill(Number(skillId), {
          command: formattedCommand,
          prompt: String(prompt),
          description: String(description),
        });
        if (!skill)
          return response.status(404).json({ message: "Skill not found." });
        response.status(200).json({ skill });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.delete(
    "/admin/system-skills/:skillId",
    [validatedRequest, strictMultiUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { skillId } = request.params;
        const deleted = await SlashCommandPresets.deleteSystemSkill(Number(skillId));
        if (!deleted)
          return response.status(404).json({ message: "Skill not found." });
        response.sendStatus(204);
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { adminEndpoints };
