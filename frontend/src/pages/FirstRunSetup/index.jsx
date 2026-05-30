import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import System from "@/models/system";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { AUTH_TOKEN, AUTH_USER } from "@/utils/constants";
import { FullScreenLoader } from "@/components/Preloader";

export default function FirstRunSetup() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (i18n.language?.split("-")[0] !== "ru") {
      i18n.changeLanguage("ru");
    }
  }, [i18n]);

  useEffect(() => {
    System.setupStatus().then((status) => {
      if (status?.hasUsers) {
        navigate(paths.login(), { replace: true });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  if (checking) return <FullScreenLoader />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast(t("onboarding.firstRunSetup.passwordsMismatch"), "error");
      return;
    }
    if (password.length < 8) {
      showToast(t("onboarding.firstRunSetup.passwordTooShort"), "error");
      return;
    }

    setLoading(true);
    try {
      const result = await System.initializeAdmin({ username, password });
      if (!result?.success) {
        showToast(
          result?.error || t("onboarding.firstRunSetup.createFailed"),
          "error"
        );
        setLoading(false);
        return;
      }

      if (result.token) {
        window.localStorage.setItem(AUTH_TOKEN, result.token);
      }
      if (result.user) {
        window.localStorage.setItem(AUTH_USER, JSON.stringify(result.user));
      }

      await System.markOnboardingComplete();

      showToast(t("onboarding.firstRunSetup.createSuccess"), "success");
      navigate(paths.home(), { replace: true });
    } catch (err) {
      showToast(
        t("onboarding.firstRunSetup.error", { message: err.message }),
        "error"
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-theme-bg-primary">
      <div className="flex flex-col items-center w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">
            {t("onboarding.firstRunSetup.title")}
          </h1>
          <p className="text-theme-text-secondary text-sm mt-2">
            {t("onboarding.firstRunSetup.subtitle")}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full bg-theme-bg-secondary border border-white/10 rounded-2xl p-8 flex flex-col gap-5"
        >
          <div className="flex flex-col gap-1">
            <label className="text-white text-sm font-medium">
              {t("onboarding.firstRunSetup.username")}
            </label>
            <input
              type="text"
              autoComplete="username"
              required
              minLength={2}
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="admin"
              className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg block w-full p-2.5 focus:outline-primary-button active:outline-primary-button outline-none placeholder:text-theme-text-secondary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-white text-sm font-medium">
              {t("onboarding.firstRunSetup.password")}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("onboarding.firstRunSetup.passwordPlaceholder")}
              className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg block w-full p-2.5 focus:outline-primary-button active:outline-primary-button outline-none placeholder:text-theme-text-secondary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-white text-sm font-medium">
              {t("onboarding.firstRunSetup.confirmPassword")}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("onboarding.firstRunSetup.confirmPasswordPlaceholder")}
              className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg block w-full p-2.5 focus:outline-primary-button active:outline-primary-button outline-none placeholder:text-theme-text-secondary"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password || !confirmPassword}
            className="w-full mt-2 py-2.5 rounded-lg bg-primary-button text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading
              ? t("onboarding.firstRunSetup.submitting")
              : t("onboarding.firstRunSetup.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
