"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

type AuthState = "checking" | "login" | "ok";

type AdminGateProps = {
  title?: string;
  subtitle?: string;
  onAuthenticated?: () => void;
  children: ReactNode;
};

export function AdminGate({
  title = "Prioridad cobro",
  subtitle = "Acceso solo administradores",
  onAuthenticated,
  children,
}: AdminGateProps) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const ok = Boolean(data.ok);
        setAuthState(ok ? "ok" : "login");
        if (ok) onAuthenticated?.();
      })
      .catch(() => setAuthState("login"));
  }, [onAuthenticated]);

  const iniciarSesion = useCallback(async () => {
    if (!password.trim()) {
      setAuthError("Escribe la contraseña");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPassword("");
        setAuthState("ok");
        onAuthenticated?.();
      } else {
        setAuthError(data.error || "Contraseña incorrecta");
      }
    } catch {
      setAuthError("Sin conexión");
    } finally {
      setAuthLoading(false);
    }
  }, [password, onAuthenticated]);

  if (authState === "checking") {
    return (
      <p className="text-center text-sm text-zinc-500 py-12">
        Verificando acceso…
      </p>
    );
  }

  if (authState === "login") {
    return (
      <section className="max-w-[414px] mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
        </div>
        <label htmlFor="admin-password-morosos" className="text-xs text-zinc-400">
          Contraseña de administrador
        </label>
        <input
          id="admin-password-morosos"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void iniciarSesion()}
          className="w-full min-h-[50px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
        />
        {authError && (
          <p role="alert" className="text-sm text-red-300">
            {authError}
          </p>
        )}
        <button
          type="button"
          onClick={() => void iniciarSesion()}
          disabled={authLoading}
          className="w-full min-h-[50px] rounded-xl bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
        >
          {authLoading ? "Entrando…" : "Entrar"}
        </button>
      </section>
    );
  }

  return <>{children}</>;
}

/** Hook ligero para saber si hay sesión admin (pestañas, etc.). */
export function useAdminSession(): {
  adminOk: boolean | null;
  refresh: () => void;
} {
  const [adminOk, setAdminOk] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/admin/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setAdminOk(Boolean(data.ok)))
      .catch(() => setAdminOk(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { adminOk, refresh };
}
