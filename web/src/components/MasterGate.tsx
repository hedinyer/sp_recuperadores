"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  guardarMasterActivo,
  leerMasterActivo,
  verificarClaveMaster,
} from "@/lib/consultaMaster";

type MasterGateProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

export function MasterGate({
  title = "Acceso master",
  subtitle = "Escribe la clave para continuar",
  children,
}: MasterGateProps) {
  const [estado, setEstado] = useState<"checking" | "login" | "ok">("checking");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEstado(leerMasterActivo() ? "ok" : "login");
  }, []);

  const entrar = useCallback(() => {
    if (!clave.trim()) {
      setError("Escribe la clave");
      return;
    }
    if (!verificarClaveMaster(clave)) {
      setError("Clave incorrecta");
      return;
    }
    guardarMasterActivo(true);
    setClave("");
    setError(null);
    setEstado("ok");
  }, [clave]);

  if (estado === "checking") {
    return (
      <p className="flex-1 flex items-center justify-center text-sm text-zinc-500 py-12">
        Verificando acceso…
      </p>
    );
  }

  if (estado === "login") {
    return (
      <main className="flex-1 w-full max-w-[414px] mx-auto px-3 sm:px-4 pt-6 flex flex-col gap-4">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>
          </div>
          <label htmlFor="master-gate-key" className="text-xs text-zinc-400">
            Clave master
          </label>
          <input
            id="master-gate-key"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            className="w-full min-h-[50px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600"
          />
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={entrar}
            className="w-full min-h-[50px] rounded-xl bg-amber-700 text-white font-semibold text-sm touch-manipulation"
          >
            Entrar
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

/** Sesión master compartida (Consultar y otras pantallas). */
export function useMasterSession(): {
  masterOk: boolean;
  setMasterOk: (ok: boolean) => void;
} {
  const [masterOk, setMasterOkState] = useState(false);

  useEffect(() => {
    setMasterOkState(leerMasterActivo());
  }, []);

  const setMasterOk = useCallback((ok: boolean) => {
    guardarMasterActivo(ok);
    setMasterOkState(ok);
  }, []);

  return { masterOk, setMasterOk };
}
