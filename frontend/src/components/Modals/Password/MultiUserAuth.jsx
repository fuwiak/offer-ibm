import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import System from "../../../models/system";
import { AUTH_TOKEN, AUTH_USER } from "../../../utils/constants";
import paths from "../../../utils/paths";
import showToast from "@/utils/toast";
import ModalWrapper from "@/components/ModalWrapper";
import { useModal } from "@/hooks/useModal";
import RecoveryCodeModal from "@/components/Modals/DisplayRecoveryCodeModal";
import { useTranslation } from "react-i18next";
import { t } from "i18next";

const RECENT_MULTI_ACCOUNTS_KEY = "offerKpRecentAccounts";

function loadRecentAccounts() {
  try {
    const raw = window.localStorage.getItem(RECENT_MULTI_ACCOUNTS_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecentAccount(username = "") {
  const normalized = String(username).trim();
  if (!normalized) return;
  const next = [normalized, ...loadRecentAccounts().filter((u) => u !== normalized)].slice(
    0,
    5
  );
  window.localStorage.setItem(RECENT_MULTI_ACCOUNTS_KEY, JSON.stringify(next));
}

const RecoveryForm = ({ onSubmit, setShowRecoveryForm }) => {
  const [username, setUsername] = useState("");
  const [recoveryCodeInputs, setRecoveryCodeInputs] = useState(
    Array(2).fill("")
  );

  const handleRecoveryCodeChange = (index, value) => {
    const updatedCodes = [...recoveryCodeInputs];
    updatedCodes[index] = value;
    setRecoveryCodeInputs(updatedCodes);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const recoveryCodes = recoveryCodeInputs.filter(
      (code) => code.trim() !== ""
    );
    onSubmit(username, recoveryCodes);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col justify-center items-center"
    >
      <div className="flex items-start justify-between pt-7 pb-9">
        <div className="flex items-center flex-col gap-y-[18px] max-w-[300px]">
          <div className="flex gap-x-1">
            <h3 className="text-white light:text-slate-950 text-3xl leading-[28px] font-medium text-center white-space-nowrap block">
              {t("login.password-reset.title")}
            </h3>
          </div>
          <p className="text-zinc-400 light:text-zinc-600 text-sm text-center">
            {t("login.password-reset.description")}
          </p>
        </div>
      </div>
      <div className="w-full px-12">
        <div className="w-full flex flex-col gap-y-3">
          <div className="w-full flex flex-col gap-y-2">
            <label className="text-zinc-300 light:text-slate-800 text-sm">
              {t("login.multi-user.placeholder-username")}
            </label>
            <input
              name="username"
              type="text"
              className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px] focus:outline-none focus:ring-1 focus:ring-sky-300"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
          <div className="w-full flex flex-col gap-y-2">
            <label className="text-zinc-300 light:text-slate-800 text-sm">
              {t("login.password-reset.recovery-codes")}
            </label>
            {recoveryCodeInputs.map((code, index) => (
              <input
                key={index}
                type="text"
                name={`recoveryCode${index + 1}`}
                className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px] focus:outline-none focus:ring-1 focus:ring-sky-300"
                value={code}
                onChange={(e) =>
                  handleRecoveryCodeChange(index, e.target.value)
                }
                required
                autoComplete="off"
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center px-12 mt-9 space-x-2 w-full flex-col gap-y-6">
        <button
          type="submit"
          className="text-zinc-950 bg-white hover:bg-zinc-300 light:bg-sky-200 light:text-slate-950 light:hover:bg-sky-300 text-sm font-semibold rounded-lg border-primary-button h-[34px] w-full"
        >
          {t("login.password-reset.title")}
        </button>
        <button
          type="button"
          className="text-zinc-200 light:text-zinc-600 hover:text-sky-300 light:hover:text-sky-600 hover:underline text-sm flex gap-x-1"
          onClick={() => setShowRecoveryForm(false)}
        >
          {t("login.password-reset.back-to-login")}
        </button>
      </div>
    </form>
  );
};

const MasterResetForm = ({ onBack }) => {
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    const { success, message, error } = await System.emergencyPasswordReset({
      username,
      newPassword,
      confirmPassword,
      masterKey,
    });
    setBusy(false);
    if (!success) {
      showToast(error || message || "Reset failed.", "error");
      return;
    }
    showToast(message || "Password reset. Log in with the new password.", "success");
    onBack();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col justify-center items-center"
    >
      <div className="flex items-start justify-between pt-7 pb-9">
        <div className="flex items-center flex-col gap-y-[18px] max-w-[320px]">
          <h3 className="text-white light:text-slate-950 text-2xl font-medium text-center">
            Reset password (master key)
          </h3>
          <p className="text-zinc-400 light:text-zinc-600 text-sm text-center">
            Set PASSWORD_RESET_MASTER_KEY on the server, then use it here.
          </p>
        </div>
      </div>
      <div className="w-full px-12 flex flex-col gap-3">
        <input
          className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px]"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          required
          autoComplete="username"
        />
        <input
          type="password"
          className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px]"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <input
          type="password"
          className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px]"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <input
          type="password"
          className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px]"
          placeholder="Master key"
          value={masterKey}
          onChange={(e) => setMasterKey(e.target.value)}
          required
          autoComplete="off"
        />
      </div>
      <div className="flex items-center px-12 mt-9 space-x-2 w-full flex-col gap-y-4">
        <button
          type="submit"
          disabled={busy}
          className="text-zinc-950 bg-white hover:bg-zinc-300 text-sm font-semibold rounded-lg h-[34px] w-full"
        >
          {busy ? "Saving…" : "Reset password"}
        </button>
        <button
          type="button"
          className="text-zinc-200 light:text-zinc-600 hover:underline text-sm"
          onClick={onBack}
        >
          Back to login
        </button>
      </div>
    </form>
  );
};

const ResetPasswordForm = ({ onSubmit }) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(newPassword, confirmPassword);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col justify-center items-center"
    >
      <div className="flex items-start justify-between pt-7 pb-9">
        <div className="flex items-center flex-col gap-y-[18px] max-w-[300px]">
          <div className="flex gap-x-1">
            <h3 className="text-white light:text-slate-950 text-[38px] leading-[28px] font-medium text-center white-space-nowrap block">
              Reset Password
            </h3>
          </div>
          <p className="text-zinc-400 light:text-zinc-600 text-sm text-center">
            Enter your new password.
          </p>
        </div>
      </div>
      <div className="w-full px-12">
        <div className="w-full flex flex-col gap-y-3">
          <div className="w-full flex flex-col gap-y-2">
            <label className="text-zinc-300 light:text-slate-800 text-sm">
              New Password
            </label>
            <input
              type="password"
              name="newPassword"
              className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px] focus:outline-none focus:ring-1 focus:ring-sky-300"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="w-full flex flex-col gap-y-2">
            <label className="text-zinc-300 light:text-slate-800 text-sm">
              Confirm Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px] focus:outline-none focus:ring-1 focus:ring-sky-300"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
        </div>
      </div>
      <div className="flex items-center px-12 mt-9 space-x-2 w-full flex-col gap-y-6">
        <button
          type="submit"
          className="text-zinc-950 bg-white hover:bg-zinc-300 light:bg-sky-200 light:text-slate-950 light:hover:bg-sky-300 text-sm font-semibold rounded-lg border-primary-button h-[34px] w-full"
        >
          Reset Password
        </button>
      </div>
    </form>
  );
};

export default function MultiUserAuth() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [showResetPasswordForm, setShowResetPasswordForm] = useState(false);
  const [showMasterResetForm, setShowMasterResetForm] = useState(false);
  const navigate = useNavigate();
  const [customAppName, setCustomAppName] = useState(null);
  const [username, setUsername] = useState("");
  const [recentAccounts, setRecentAccounts] = useState([]);

  const {
    isOpen: isRecoveryCodeModalOpen,
    openModal: openRecoveryCodeModal,
    closeModal: closeRecoveryCodeModal,
  } = useModal();

  const handleLogin = async (e) => {
    setError(null);
    setLoading(true);
    e.preventDefault();
    const form = new FormData(e.target);
    const data = {
      username: String(username).trim().toLowerCase(),
      password: String(form.get("password") ?? ""),
    };
    if (!data.username || !data.password) {
      setError("[001] Invalid login credentials.");
      setLoading(false);
      return;
    }
    const { valid, user, token, message, recoveryCodes } =
      await System.requestToken(data);
    if (valid && !!token && !!user) {
      setUser(user);
      setToken(token);
      saveRecentAccount(data.username);
      setRecentAccounts(loadRecentAccounts());

      if (recoveryCodes) {
        setRecoveryCodes(recoveryCodes);
        openRecoveryCodeModal();
      } else {
        window.localStorage.setItem(AUTH_USER, JSON.stringify(user));
        window.localStorage.setItem(AUTH_TOKEN, token);
        window.location = paths.home();
      }
    } else {
      setError(message);
      setLoading(false);
    }
    setLoading(false);
  };

  const handleDownloadComplete = () => setDownloadComplete(true);
  const handleResetPassword = () => setShowRecoveryForm(true);
  const handleRecoverySubmit = async (username, recoveryCodes) => {
    const { success, resetToken, error } = await System.recoverAccount(
      username,
      recoveryCodes
    );

    if (success && resetToken) {
      window.localStorage.setItem("resetToken", resetToken);
      setShowRecoveryForm(false);
      setShowResetPasswordForm(true);
    } else {
      showToast(error, "error", { clear: true });
    }
  };

  const handleResetSubmit = async (newPassword, confirmPassword) => {
    const resetToken = window.localStorage.getItem("resetToken");

    if (resetToken) {
      const { success, error } = await System.resetPassword(
        resetToken,
        newPassword,
        confirmPassword
      );

      if (success) {
        window.localStorage.removeItem("resetToken");
        setShowResetPasswordForm(false);
        showToast("Password reset successful", "success", { clear: true });
      } else {
        showToast(error, "error", { clear: true });
      }
    } else {
      showToast("Invalid reset token", "error", { clear: true });
    }
  };

  useEffect(() => {
    if (downloadComplete && user && token) {
      window.localStorage.setItem(AUTH_USER, JSON.stringify(user));
      window.localStorage.setItem(AUTH_TOKEN, token);
      window.location = paths.home();
    }
  }, [downloadComplete, user, token]);

  useEffect(() => {
    setRecentAccounts(loadRecentAccounts());
    const fetchCustomAppName = async () => {
      const status = await System.setupStatus();
      if (status?.needsFirstRun) {
        navigate(paths.firstRun(), { replace: true });
        return;
      }
      const { appName } = await System.fetchCustomAppName();
      setCustomAppName(appName || "");
      setLoading(false);
    };
    fetchCustomAppName();
  }, [navigate]);

  if (showRecoveryForm) {
    return (
      <RecoveryForm
        onSubmit={handleRecoverySubmit}
        setShowRecoveryForm={setShowRecoveryForm}
      />
    );
  }

  if (showResetPasswordForm)
    return <ResetPasswordForm onSubmit={handleResetSubmit} />;
  if (showMasterResetForm)
    return (
      <MasterResetForm
        onBack={() => {
          setShowMasterResetForm(false);
          setError(null);
        }}
      />
    );
  return (
    <>
      <form
        onSubmit={handleLogin}
        className="flex flex-col justify-center items-center"
      >
        <div className="flex items-start justify-between pt-7 pb-9">
          <div className="flex items-center flex-col gap-y-[18px] max-w-[300px]">
            <div className="flex gap-x-1">
              <h3 className="text-white light:text-slate-950 text-[38px] leading-[28px] font-medium text-center white-space-nowrap block">
                {t("login.multi-user.welcome")}
              </h3>
            </div>
            <p className="text-zinc-400 light:text-zinc-600 text-sm text-center">
              {t("login.sign-in", {
                appName: customAppName || "OfferKP",
              })}
            </p>
          </div>
        </div>
        <div className="w-full px-12">
          <div className="w-full flex flex-col gap-y-3">
            <div className="w-full flex flex-col gap-y-2">
              <label className="text-zinc-300 light:text-slate-800 text-sm">
                {t("login.multi-user.placeholder-username")}
              </label>
              <input
                name="username"
                type="text"
                className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px] focus:outline-none focus:ring-1 focus:ring-sky-300"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                list="recent-multi-accounts"
                required={true}
                autoComplete="off"
              />
              <datalist id="recent-multi-accounts">
                {recentAccounts.map((account) => (
                  <option key={account} value={account} />
                ))}
              </datalist>
              {recentAccounts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {recentAccounts.map((account) => (
                    <button
                      key={account}
                      type="button"
                      onClick={() => setUsername(account)}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 light:bg-slate-200 light:text-slate-700 hover:bg-zinc-700 light:hover:bg-slate-300"
                    >
                      {account}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-full px-0 flex flex-col gap-y-2">
              <label className="text-zinc-300 light:text-slate-800 text-sm">
                {t("login.multi-user.placeholder-password")}
              </label>
              <input
                name="password"
                type="password"
                className="border-none bg-zinc-800 light:bg-slate-200 text-zinc-200 light:text-zinc-600 text-sm rounded-lg p-2.5 w-[300px] h-[34px] focus:outline-none focus:ring-1 focus:ring-sky-300"
                required={true}
                autoComplete="off"
              />
            </div>
            {error && <p className="text-red-400 text-sm">Error: {error}</p>}
          </div>
        </div>
        <div className="flex items-center px-12 mt-9 space-x-2 w-full flex-col gap-y-6">
          <button
            disabled={loading}
            type="submit"
            className="text-zinc-950 bg-white hover:bg-zinc-300 light:bg-sky-200 light:text-slate-950 light:hover:bg-sky-300 text-sm font-semibold rounded-lg border-primary-button h-[34px] w-full"
          >
            {loading
              ? t("login.multi-user.validating")
              : t("login.multi-user.login")}
          </button>
          <button
            type="button"
            className="text-zinc-200 light:text-zinc-600 hover:text-sky-300 light:hover:text-sky-600 hover:underline text-sm flex gap-x-1"
            onClick={handleResetPassword}
          >
            {t("login.multi-user.forgot-pass")}?
            <b className="font-semibold text-sky-300 light:text-sky-600">
              {t("login.multi-user.reset")}
            </b>
          </button>
          <button
            type="button"
            className="text-zinc-400 light:text-zinc-500 hover:text-sky-300 text-xs hover:underline"
            onClick={() => setShowMasterResetForm(true)}
          >
            Reset with master key
          </button>
        </div>
      </form>

      <ModalWrapper isOpen={isRecoveryCodeModalOpen} noPortal={true}>
        <RecoveryCodeModal
          recoveryCodes={recoveryCodes}
          onDownloadComplete={handleDownloadComplete}
          onClose={closeRecoveryCodeModal}
        />
      </ModalWrapper>
    </>
  );
}
