import { useEffect, useState } from "react";
import LawyerRevizorroPageShell from "@/components/LawyerRevizorro/LawyerRevizorroPageShell";
import LanguageSwitcher from "@/components/LawyerRevizorro/LanguageSwitcher";
import useUser from "@/hooks/useUser";
import useLawyerRevizorroRole from "@/hooks/useLawyerRevizorroRole";
import { useTranslation } from "react-i18next";
import System from "@/models/system";
import showToast from "@/utils/toast";
import { AUTH_USER } from "@/utils/constants";

export default function ProfilePage() {
  const { t } = useTranslation("lawyerRevizorro");
  const { user } = useUser();
  const { role } = useLawyerRevizorroRole();
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    companyName: "",
    companyAddress: "",
    contactEmail: "",
    contactPhone: "",
  });

  useEffect(() => {
    const fallbackName = user?.name || user?.username || "";
    const [first = "", ...rest] = fallbackName.split(" ");
    setProfile({
      firstName: user?.firstName || first || "",
      lastName: user?.lastName || rest.join(" ") || "",
      companyName: user?.companyName || user?.company || "",
      companyAddress: user?.companyAddress || user?.address || "",
      contactEmail: user?.contactEmail || user?.email || "",
      contactPhone: user?.contactPhone || user?.phone || "",
    });
  }, [user]);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
    const payload = {
      firstName: profile.firstName.trim(),
      lastName: profile.lastName.trim(),
      name: fullName,
      companyName: profile.companyName.trim(),
      companyAddress: profile.companyAddress.trim(),
      contactEmail: profile.contactEmail.trim(),
      contactPhone: profile.contactPhone.trim(),
    };
    const { success, user: updatedUser, error } = await System.updateUser(payload);
    if (!success) {
      showToast(error || "Failed to update profile.", "error");
      setSaving(false);
      return;
    }

    const refreshed = await System.refreshUser();
    const nextUser = refreshed?.user || updatedUser;
    if (nextUser) {
      window.localStorage.setItem(AUTH_USER, JSON.stringify(nextUser));
    }
    showToast("Profile updated.", "success");
    setSaving(false);
  }

  return (
    <LawyerRevizorroPageShell title={t("admin.profile")} subtitle={t("account.profileSubtitle")}>
      <form
        className="max-w-2xl space-y-6 border border-theme-sidebar-border bg-theme-bg-primary p-6"
        onSubmit={saveProfile}
      >
        <div>
          <p className="text-xs uppercase tracking-wide text-theme-text-secondary">
            {t("account.displayName")}
          </p>
          <p className="text-lg text-theme-text-primary mt-1">
            {user?.username ?? "—"}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-theme-text-secondary mb-2">
              First name
            </label>
            <input
              className="lawyerRevizorro-carbon-input w-full"
              value={profile.firstName}
              onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
              placeholder="John"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-theme-text-secondary mb-2">
              Last name
            </label>
            <input
              className="lawyerRevizorro-carbon-input w-full"
              value={profile.lastName}
              onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
              placeholder="Macron"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-theme-text-secondary mb-2">
            Company name
          </label>
          <input
            className="lawyerRevizorro-carbon-input w-full"
            value={profile.companyName}
            onChange={(e) => setProfile((p) => ({ ...p, companyName: e.target.value }))}
            placeholder="Entreprise Dupont"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-theme-text-secondary mb-2">
            Company address
          </label>
          <input
            className="lawyerRevizorro-carbon-input w-full"
            value={profile.companyAddress}
            onChange={(e) =>
              setProfile((p) => ({ ...p, companyAddress: e.target.value }))
            }
            placeholder="12 Rue de la Paix, Paris"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-theme-text-secondary mb-2">
              Contact email
            </label>
            <input
              className="lawyerRevizorro-carbon-input w-full"
              value={profile.contactEmail}
              onChange={(e) =>
                setProfile((p) => ({ ...p, contactEmail: e.target.value }))
              }
              placeholder="john@dupont.fr"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-theme-text-secondary mb-2">
              Contact phone
            </label>
            <input
              className="lawyerRevizorro-carbon-input w-full"
              value={profile.contactPhone}
              onChange={(e) =>
                setProfile((p) => ({ ...p, contactPhone: e.target.value }))
              }
              placeholder="+33 6 00 00 00 00"
            />
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-theme-text-secondary">
            {t("account.role")}
          </p>
          <p className="text-sm text-theme-text-primary mt-1 capitalize">
            {role?.replace(/_/g, " ") ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-theme-text-secondary mb-2">
            {t("account.language")}
          </p>
          <LanguageSwitcher />
        </div>
        <button
          type="submit"
          className="lawyerRevizorro-btn-new-chat w-auto"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </LawyerRevizorroPageShell>
  );
}
