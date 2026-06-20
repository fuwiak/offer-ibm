import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "@/App.jsx";
import PrivateRoute, {
  AdminRoute,
  AdminOrManagerRoute,
  ManagerRoute,
  SingleUserRoute,
} from "@/components/PrivateRoute";
import Login from "@/pages/Login";
import SimpleSSOPassthrough from "@/pages/Login/SSO/simple";
import OnboardingFlow from "@/pages/OnboardingFlow";
import FirstRunSetup from "@/pages/FirstRunSetup";
import "@/index.css";
import { installAppLogger } from "@/utils/appLogger";
import { installPerfLogger } from "@/utils/perfLogger";

installAppLogger();
installPerfLogger();

const isDev = import.meta.env.DEV;
const REACTWRAP = isDev ? React.Fragment : React.StrictMode;

const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        // Pathless layout: children own full paths (/account/profile, /active-items, …).
        // A parent with path "/" only matches "/" exactly and breaks nested account routes.
        lazy: async () => {
          const { default: Main } = await import("@/pages/Main");
          return {
            element: <PrivateRoute Component={Main} />,
          };
        },
        children: [
              {
                index: true,
                lazy: async () => {
                  const { default: Home } = await import("@/pages/Main/Home");
                  return { element: <Home /> };
                },
              },
              {
                path: "dashboard",
                lazy: async () => {
                  const { default: Dashboard } = await import(
                    "@/pages/Main/Dashboard"
                  );
                  return { element: <Dashboard /> };
                },
              },
              {
                path: "account/profile",
                lazy: async () => {
                  const { default: Profile } = await import(
                    "@/pages/Main/Account/Profile"
                  );
                  return { element: <Profile /> };
                },
              },
              {
                path: "account/users",
                lazy: async () => {
                  const { default: AccountUsers } = await import(
                    "@/pages/Main/Account/Users"
                  );
                  return { element: <AccountUsers /> };
                },
              },
              {
                path: "account/settings",
                lazy: async () => {
                  const { default: Settings } = await import(
                    "@/pages/Main/Account/Settings"
                  );
                  return { element: <Settings /> };
                },
              },
              {
                path: "chat",
                lazy: async () => {
                  const { default: ChatLauncher } = await import(
                    "@/pages/Main/Chat"
                  );
                  return { element: <ChatLauncher /> };
                },
              },
              {
                path: "workspace/:slug/t/:threadSlug",
                lazy: async () => {
                  const { ShowWorkspaceChat } = await import(
                    "@/pages/WorkspaceChat"
                  );
                  return { element: <ShowWorkspaceChat /> };
                },
              },
              {
                path: "workspace/:slug",
                lazy: async () => {
                  const { ShowWorkspaceChat } = await import(
                    "@/pages/WorkspaceChat"
                  );
                  return { element: <ShowWorkspaceChat /> };
                },
              },
            ],
      },
      {
        path: "/offerKp",
        lazy: async () => {
          const { default: OfferKpPage } = await import("@/pages/OfferKp");
          return { element: <OfferKpPage /> };
        },
      },
      {
        path: "/bot",
        lazy: async () => {
          const { default: BotPage } = await import("@/pages/Bot");
          return { element: <BotPage /> };
        },
      },
      {
        path: "/ibm-z",
        lazy: async () => {
          const { Navigate } = await import("react-router-dom");
          return { element: <Navigate to="/offerKp" replace /> };
        },
      },
      {
        path: "/leads",
        lazy: async () => {
          const { Navigate } = await import("react-router-dom");
          return { element: <Navigate to="/" replace /> };
        },
      },
      {
        path: "/active-items",
        lazy: async () => {
          const { Navigate } = await import("react-router-dom");
          return { element: <Navigate to="/" replace /> };
        },
      },
      {
        path: "/active-leads",
        lazy: async () => {
          const { Navigate } = await import("react-router-dom");
          return { element: <Navigate to="/" replace /> };
        },
      },
      {
        path: "/orders",
        lazy: async () => {
          const { Navigate } = await import("react-router-dom");
          return { element: <Navigate to="/" replace /> };
        },
      },
      {
        path: "/offerKp-dashboard",
        lazy: async () => {
          const { default: OfferKpDashboard } = await import("@/pages/Admin/OfferKpDashboard");
          return { element: <AdminRoute Component={OfferKpDashboard} /> };
        },
      },
      {
        path: "/offerKp-db",
        lazy: async () => {
          const { default: ShopDbExplorer } = await import("@/pages/Admin/ShopDbExplorer");
          return { element: <AdminRoute Component={ShopDbExplorer} /> };
        },
      },
      {
        path: "/supplier",
        lazy: async () => {
          const { default: SupplierWorkflow } = await import("@/pages/OfferKp/SupplierWorkflow");
          return { element: <PrivateRoute Component={SupplierWorkflow} /> };
        },
      },
      {
        path: "/login",
        element: <Login />,
      },
      {
        path: "/first-run",
        element: <FirstRunSetup />,
      },
      {
        path: "/sso/simple",
        element: <SimpleSSOPassthrough />,
      },
      {
        path: "/workspace/:slug/settings/:tab",
        lazy: async () => {
          const { default: WorkspaceSettings } = await import(
            "@/pages/WorkspaceSettings"
          );
          return { element: <AdminRoute Component={WorkspaceSettings} /> };
        },
      },
      {
        path: "/accept-invite/:code",
        lazy: async () => {
          const { default: InvitePage } = await import("@/pages/Invite");
          return { element: <InvitePage /> };
        },
      },
      // Admin routes
      {
        path: "/settings/llm-preference",
        lazy: async () => {
          const { default: GeneralLLMPreference } = await import(
            "@/pages/GeneralSettings/LLMPreference"
          );
          return { element: <AdminRoute Component={GeneralLLMPreference} /> };
        },
      },
      {
        path: "/settings/transcription-preference",
        lazy: async () => {
          const { default: GeneralTranscriptionPreference } = await import(
            "@/pages/GeneralSettings/TranscriptionPreference"
          );
          return {
            element: <AdminRoute Component={GeneralTranscriptionPreference} />,
          };
        },
      },
      {
        path: "/settings/audio-preference",
        lazy: async () => {
          const { default: GeneralAudioPreference } = await import(
            "@/pages/GeneralSettings/AudioPreference"
          );
          return {
            element: <AdminRoute Component={GeneralAudioPreference} />,
          };
        },
      },
      {
        path: "/settings/embedding-preference",
        lazy: async () => {
          const { default: GeneralEmbeddingPreference } = await import(
            "@/pages/GeneralSettings/EmbeddingPreference"
          );
          return {
            element: <AdminRoute Component={GeneralEmbeddingPreference} />,
          };
        },
      },
      {
        path: "/settings/text-splitter-preference",
        lazy: async () => {
          const { default: EmbeddingTextSplitterPreference } = await import(
            "@/pages/GeneralSettings/EmbeddingTextSplitterPreference"
          );
          return {
            element: <AdminRoute Component={EmbeddingTextSplitterPreference} />,
          };
        },
      },
      {
        path: "/settings/vector-database",
        lazy: async () => {
          const { default: GeneralVectorDatabase } = await import(
            "@/pages/GeneralSettings/VectorDatabase"
          );
          return {
            element: <AdminRoute Component={GeneralVectorDatabase} />,
          };
        },
      },
      {
        path: "/settings/agents",
        lazy: async () => {
          const { default: AdminAgents } = await import("@/pages/Admin/Agents");
          return { element: <AdminRoute Component={AdminAgents} /> };
        },
      },
      {
        path: "/settings/agents/builder",
        lazy: async () => {
          const { default: AgentBuilder } = await import(
            "@/pages/Admin/AgentBuilder"
          );
          return {
            element: (
              <AdminRoute Component={AgentBuilder} hideUserMenu={true} />
            ),
          };
        },
      },
      {
        path: "/settings/agents/builder/:flowId",
        lazy: async () => {
          const { default: AgentBuilder } = await import(
            "@/pages/Admin/AgentBuilder"
          );
          return {
            element: (
              <AdminRoute Component={AgentBuilder} hideUserMenu={true} />
            ),
          };
        },
      },
      {
        path: "/settings/event-logs",
        lazy: async () => {
          const { default: AdminLogs } = await import("@/pages/Admin/Logging");
          return { element: <AdminRoute Component={AdminLogs} /> };
        },
      },
      {
        path: "/settings/embed-chat-widgets",
        lazy: async () => {
          const { default: ChatEmbedWidgets } = await import(
            "@/pages/GeneralSettings/ChatEmbedWidgets"
          );
          return { element: <AdminRoute Component={ChatEmbedWidgets} /> };
        },
      },
      // Manager routes
      {
        path: "/settings/security",
        lazy: async () => {
          const { default: GeneralSecurity } = await import(
            "@/pages/GeneralSettings/Security"
          );
          return { element: <ManagerRoute Component={GeneralSecurity} /> };
        },
      },
      {
        path: "/settings/privacy",
        lazy: async () => {
          const { default: PrivacyAndData } = await import(
            "@/pages/GeneralSettings/PrivacyAndData"
          );
          return { element: <AdminRoute Component={PrivacyAndData} /> };
        },
      },
      {
        path: "/settings/interface",
        lazy: async () => {
          const { default: InterfaceSettings } = await import(
            "@/pages/GeneralSettings/Settings/Interface"
          );
          return { element: <ManagerRoute Component={InterfaceSettings} /> };
        },
      },
      {
        path: "/settings/branding",
        lazy: async () => {
          const { default: BrandingSettings } = await import(
            "@/pages/GeneralSettings/Settings/Branding"
          );
          return { element: <ManagerRoute Component={BrandingSettings} /> };
        },
      },
      {
        path: "/settings/default-system-prompt",
        lazy: async () => {
          const { default: DefaultSystemPrompt } = await import(
            "@/pages/Admin/DefaultSystemPrompt"
          );
          return { element: <AdminRoute Component={DefaultSystemPrompt} /> };
        },
      },
      {
        path: "/settings/skills",
        lazy: async () => {
          const { default: AdminSkills } = await import("@/pages/Admin/Skills");
          return { element: <AdminRoute Component={AdminSkills} /> };
        },
      },
      {
        path: "/settings/chat",
        lazy: async () => {
          const { default: ChatSettings } = await import(
            "@/pages/GeneralSettings/Settings/Chat"
          );
          return { element: <ManagerRoute Component={ChatSettings} /> };
        },
      },
      {
        path: "/settings/beta-features",
        lazy: async () => {
          const { default: ExperimentalFeatures } = await import(
            "@/pages/Admin/ExperimentalFeatures"
          );
          return { element: <AdminRoute Component={ExperimentalFeatures} /> };
        },
      },
      {
        path: "/settings/api-keys",
        lazy: async () => {
          const { default: GeneralApiKeys } = await import(
            "@/pages/GeneralSettings/ApiKeys"
          );
          return { element: <AdminRoute Component={GeneralApiKeys} /> };
        },
      },
      {
        path: "/settings/system-prompt-variables",
        lazy: async () => {
          const { default: SystemPromptVariables } = await import(
            "@/pages/Admin/SystemPromptVariables"
          );
          return {
            element: <AdminRoute Component={SystemPromptVariables} />,
          };
        },
      },
      {
        path: "/settings/browser-extension",
        lazy: async () => {
          const { default: GeneralBrowserExtension } = await import(
            "@/pages/GeneralSettings/BrowserExtensionApiKey"
          );
          return {
            element: <ManagerRoute Component={GeneralBrowserExtension} />,
          };
        },
      },
      {
        path: "/settings/workspace-chats",
        lazy: async () => {
          const { default: GeneralChats } = await import(
            "@/pages/GeneralSettings/Chats"
          );
          return { element: <ManagerRoute Component={GeneralChats} /> };
        },
      },
      {
        path: "/settings/invites",
        lazy: async () => {
          const { default: AdminInvites } = await import(
            "@/pages/Admin/Invitations"
          );
          return { element: <ManagerRoute Component={AdminInvites} /> };
        },
      },
      {
        path: "/settings/users",
        lazy: async () => {
          const { default: AdminUsers } = await import(
            "@/pages/Admin/Users"
          );
          return { element: <AdminRoute Component={AdminUsers} /> };
        },
      },
      {
        path: "/settings/workspaces",
        lazy: async () => {
          const { Navigate } = await import("react-router-dom");
          return { element: <Navigate to="/settings/user-workspaces" replace /> };
        },
      },
      {
        path: "/settings/workspaces/new",
        lazy: async () => {
          const { Navigate } = await import("react-router-dom");
          return { element: <Navigate to="/settings/user-workspaces" replace /> };
        },
      },
      {
        path: "/settings/user-workspaces",
        lazy: async () => {
          const { default: UserWorkspaces } = await import(
            "@/pages/Admin/UserWorkspaces"
          );
          return { element: <AdminOrManagerRoute Component={UserWorkspaces} /> };
        },
      },
      {
        path: "/settings/user-workspaces/:slug/instructions",
        lazy: async () => {
          const { default: UserWorkspaceInstructions } = await import(
            "@/pages/Admin/UserWorkspaces/Instructions"
          );
          return {
            element: <AdminOrManagerRoute Component={UserWorkspaceInstructions} />,
          };
        },
      },
      {
        path: "/settings/user-workspaces/:slug/files",
        lazy: async () => {
          const { default: UserWorkspaceFiles } = await import(
            "@/pages/Admin/UserWorkspaces/Files"
          );
          return { element: <AdminOrManagerRoute Component={UserWorkspaceFiles} /> };
        },
      },
      // Onboarding Flow
      {
        path: "/onboarding",
        element: <OnboardingFlow />,
      },
      {
        path: "/onboarding/:step",
        element: <OnboardingFlow />,
      },
      // Experimental feature pages
      {
        path: "/settings/beta-features/live-document-sync/manage",
        lazy: async () => {
          const { default: LiveDocumentSyncManage } = await import(
            "@/pages/Admin/ExperimentalFeatures/Features/LiveSync/manage"
          );
          return {
            element: <AdminRoute Component={LiveDocumentSyncManage} />,
          };
        },
      },
      {
        path: "/settings/community-hub/trending",
        lazy: async () => {
          const { default: CommunityHubTrending } = await import(
            "@/pages/GeneralSettings/CommunityHub/Trending"
          );
          return { element: <AdminRoute Component={CommunityHubTrending} /> };
        },
      },
      {
        path: "/settings/community-hub/authentication",
        lazy: async () => {
          const { default: CommunityHubAuthentication } = await import(
            "@/pages/GeneralSettings/CommunityHub/Authentication"
          );
          return {
            element: <AdminRoute Component={CommunityHubAuthentication} />,
          };
        },
      },
      {
        path: "/settings/community-hub/import-item",
        lazy: async () => {
          const { default: CommunityHubImportItem } = await import(
            "@/pages/GeneralSettings/CommunityHub/ImportItem"
          );
          return {
            element: <AdminRoute Component={CommunityHubImportItem} />,
          };
        },
      },
      {
        path: "/settings/mobile-connections",
        lazy: async () => {
          const { default: MobileConnections } = await import(
            "@/pages/GeneralSettings/MobileConnections"
          );
          return { element: <ManagerRoute Component={MobileConnections} /> };
        },
      },
      {
        path: "/settings/external-connections/telegram",
        lazy: async () => {
          const { default: TelegramBotSettings } = await import(
            "@/pages/GeneralSettings/Connections/TelegramBot"
          );
          return { element: <AdminRoute Component={TelegramBotSettings} /> };
        },
      },
      {
        path: "/settings/scheduled-jobs",
        lazy: async () => {
          const { default: ScheduledJobs } = await import(
            "@/pages/GeneralSettings/ScheduledJobs"
          );
          return { element: <SingleUserRoute Component={ScheduledJobs} /> };
        },
      },
      {
        path: "/settings/scheduled-jobs/:id/runs",
        lazy: async () => {
          const { default: ScheduledJobRuns } = await import(
            "@/pages/GeneralSettings/ScheduledJobs/RunHistoryPage"
          );
          return { element: <SingleUserRoute Component={ScheduledJobRuns} /> };
        },
      },
      {
        path: "/settings/scheduled-jobs/:id/runs/:runId",
        lazy: async () => {
          const { default: ScheduledJobRunDetail } = await import(
            "@/pages/GeneralSettings/ScheduledJobs/RunDetailPage"
          );
          return {
            element: <SingleUserRoute Component={ScheduledJobRunDetail} />,
          };
        },
      },
      // Catch-all route for 404s
      {
        path: "*",
        lazy: async () => {
          const { default: NotFound } = await import("@/pages/404");
          return { element: <NotFound /> };
        },
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <REACTWRAP>
    <RouterProvider router={router} />
  </REACTWRAP>
);
