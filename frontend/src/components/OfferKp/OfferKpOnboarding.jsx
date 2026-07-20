import { useState } from "react";
import { X, ArrowRight } from "@phosphor-icons/react";
import useOfferKpRole from "@/hooks/useOfferKpRole";
import useUser from "@/hooks/useUser";

const ONBOARDING = {
  admin: {
    title: "Welcome, Admin",
    color: "#cc785c",
    steps: [
      {
        heading: "Platform overview",
        body: "You have full control over the offer-kp platform. Access the dashboard at /offerKp-dashboard to monitor KPIs, quotes, and the sales pipeline.",
        icon: "📊",
      },
      {
        heading: "User management",
        body: "Manage users, roles, and invitations under Settings → Users. Create partner, sales, and supplier accounts with the appropriate role.",
        icon: "👥",
      },
      {
        heading: "Leads inbox",
        body: "Inbound partner requests appear in /leads. AI auto-classifies them and suggests the nearest partner. Assign and notify in one click.",
        icon: "📥",
      },
      {
        heading: "Configure AI",
        body: "Set Claude as the LLM provider under Settings → LLM Preference. Create an 'offerKp-public' workspace for the public bot.",
        icon: "🤖",
      },
    ],
  },
  partner: {
    title: "Welcome, Partner",
    color: "#42be65",
    steps: [
      {
        heading: "Your price list",
        body: "Your personalised offer-kp price list is available in the chat. Ask 'Show me my price list' to get your tier pricing.",
        icon: "💶",
      },
      {
        heading: "Create a quote",
        body: "Use the guided quoting flow in the right panel. Select a product, enter dimensions, and generate a shareable PDF quote in 6 steps.",
        icon: "📄",
      },
      {
        heading: "Track your orders",
        body: "Your active orders appear in the sidebar under Orders. You'll receive proactive notifications when LandVac ships your glass.",
        icon: "📦",
      },
      {
        heading: "After-sales support",
        body: "Report any issue via SAV in the sidebar. Upload photos and describe the defect — our team responds within 24 hours.",
        icon: "🎧",
      },
    ],
  },
  internal_sales: {
    title: "Welcome, Internal Sales",
    color: "#f1c21b",
    steps: [
      {
        heading: "Your partner portfolio",
        body: "You manage a portfolio of assigned partners. Their quotes, orders, and after-sales requests are visible in your dashboard.",
        icon: "🗂️",
      },
      {
        heading: "Quote on behalf",
        body: "You can create and send quotes on behalf of your partners. Use the guided quoting flow and select the partner's pricing tier.",
        icon: "📄",
      },
      {
        heading: "Leads inbox",
        body: "Inbound leads from your territory appear in /leads. Classify, assign to the right partner, and track follow-up status.",
        icon: "📥",
      },
    ],
  },
  external_sales: {
    title: "Welcome, External Sales",
    color: "#ff832b",
    steps: [
      {
        heading: "Your commission dashboard",
        body: "Track your commissions in real time. Ask the bot 'Show my commissions Q1 2025' to get a detailed breakdown with export.",
        icon: "💰",
      },
      {
        heading: "Quote and manage partners",
        body: "All partner and internal sales features are available to you, plus your exclusive commission tracking and export.",
        icon: "📄",
      },
      {
        heading: "Proactive notifications",
        body: "You'll be notified when a commission is paid, a quote expires, or a major order is placed by your partners.",
        icon: "🔔",
      },
    ],
  },
  supplier: {
    title: "Welcome, LandVac",
    color: "#8a3ffc",
    steps: [
      {
        heading: "Receiving orders",
        body: "New orders from Alliaverre appear in the Supplier Portal (/supplier). Each order shows dimensions, quantities, and the partner destination (anonymised).",
        icon: "📦",
      },
      {
        heading: "Upload shipping documents",
        body: "For each order, upload the Proforma Invoice (PI), Commercial Invoice, and Bill of Lading directly in the portal.",
        icon: "📎",
      },
      {
        heading: "Update production status",
        body: "Keep partners informed by updating the production status: confirmed → in production → quality check → ready to ship → shipped.",
        icon: "🏭",
      },
      {
        heading: "Data privacy",
        body: "You never see partner names, resale prices, or margin information. All communication goes through Alliaverre.",
        icon: "🔒",
      },
    ],
  },
  default: {
    title: "Welcome to offer-kp",
    color: "#cc785c",
    steps: [
      {
        heading: "Your AI assistant",
        body: "Ask anything about offer-kp products, technical specifications, and availability. The bot adapts to your role automatically.",
        icon: "💬",
      },
    ],
  },
};

const STORAGE_KEY = "offerKp_onboarding_seen";
const ROLE_LABELS = {
  admin: "Admin",
  partner: "Partner",
  internal_sales: "Internal Sales",
  external_sales: "External Sales",
  supplier: "LandVac",
};

export function useOfferKpOnboarding() {
  const { role } = useOfferKpRole();
  const key = `${STORAGE_KEY}_${role}`;
  const seen = !!localStorage.getItem(key);
  function markSeen() {
    localStorage.setItem(key, "1");
  }
  return { seen, markSeen };
}

export default function OfferKpOnboarding({ onDone }) {
  const { role } = useOfferKpRole();
  const { user } = useUser();
  const config = ONBOARDING[role] ?? ONBOARDING.default;
  const [step, setStep] = useState(0);
  const totalSteps = config.steps.length;
  const current = config.steps[step];
  const isLast = step === totalSteps - 1;
  const greetingTarget = user?.login || user?.username || ROLE_LABELS[role];
  const title = greetingTarget ? `Welcome, ${greetingTarget}` : config.title;

  function next() {
    if (isLast) {
      onDone?.();
    } else {
      setStep((s) => s + 1);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm bg-zinc-900 light:bg-white border border-white/10 light:border-slate-200 shadow-2xl">
        {/* Header bar */}
        <div
          className="h-1"
          style={{ background: config.color }}
        />

        <div className="p-6">
          {/* Title */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-white light:text-slate-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onDone}
              className="text-white/40 hover:text-white light:text-slate-400 light:hover:text-slate-600"
              aria-label="Skip onboarding"
            >
              <X size={16} />
            </button>
          </div>

          {/* Step content */}
          <div className="text-center py-4">
            <span className="text-4xl mb-4 block">{current.icon}</span>
            <h3 className="text-base font-semibold text-white light:text-slate-900 mb-2">
              {current.heading}
            </h3>
            <p className="text-xs leading-relaxed text-white/60 light:text-slate-500">
              {current.body}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 my-5">
            {config.steps.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className="w-1.5 h-1.5 transition-all"
                style={{
                  background: i === step ? config.color : "rgba(255,255,255,0.2)",
                  transform: i === step ? "scale(1.3)" : "scale(1)",
                }}
              />
            ))}
          </div>

          {/* Actions */}
          <button
            type="button"
            onClick={next}
            className="w-full py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            style={{ background: config.color, color: "#fff" }}
          >
            {isLast ? "Get started" : "Next"}
            <ArrowRight size={14} />
          </button>

          {!isLast && (
            <button
              type="button"
              onClick={onDone}
              className="w-full mt-2 py-1.5 text-xs text-white/30 light:text-slate-400 hover:text-white/50"
            >
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
