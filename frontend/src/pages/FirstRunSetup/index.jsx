import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import System from "@/models/system";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { AUTH_TOKEN, AUTH_USER } from "@/utils/constants";
import { FullScreenLoader } from "@/components/Preloader";

export default function FirstRunSetup() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
      showToast("Hasła się nie zgadzają.", "error");
      return;
    }
    if (password.length < 8) {
      showToast("Hasło musi mieć co najmniej 8 znaków.", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await System.initializeAdmin({ username, password });
      if (!result?.success) {
        showToast(
          result?.error || "Nie udało się utworzyć konta admina.",
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

      showToast("Konto admina utworzone. Witaj!", "success");
      navigate(paths.home(), { replace: true });
    } catch (err) {
      showToast("Wystąpił błąd: " + err.message, "error");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-theme-bg-primary">
      <div className="flex flex-col items-center w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Pierwsze uruchomienie</h1>
          <p className="text-theme-text-secondary text-sm mt-2">
            Utwórz konto administratora, aby zacząć.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full bg-theme-bg-secondary border border-white/10 rounded-2xl p-8 flex flex-col gap-5"
        >
          <div className="flex flex-col gap-1">
            <label className="text-white text-sm font-medium">Nazwa użytkownika</label>
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
            <label className="text-white text-sm font-medium">Hasło</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 znaków"
              className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg block w-full p-2.5 focus:outline-primary-button active:outline-primary-button outline-none placeholder:text-theme-text-secondary"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-white text-sm font-medium">Potwierdź hasło</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Powtórz hasło"
              className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg block w-full p-2.5 focus:outline-primary-button active:outline-primary-button outline-none placeholder:text-theme-text-secondary"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password || !confirmPassword}
            className="w-full mt-2 py-2.5 rounded-lg bg-primary-button text-white font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? "Tworzenie konta..." : "Utwórz konto admina"}
          </button>
        </form>
      </div>
    </div>
  );
}
