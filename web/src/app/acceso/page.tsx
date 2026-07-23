"use client";

import { useCallback, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AccesoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const entrar = useCallback(async () => {
    if (!key.trim()) {
      setError("Escribe la clave");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/access/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setKey("");
        const dest =
          nextPath.startsWith("/") && !nextPath.startsWith("//")
            ? nextPath
            : "/";
        router.replace(dest);
        router.refresh();
      } else {
        setError(data.error || "Clave incorrecta");
      }
    } catch {
      setError("Sin conexión");
    } finally {
      setLoading(false);
    }
  }, [key, nextPath, router]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 bg-zinc-950">
      <section className="w-full max-w-[414px] rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-3">
        <div>
          <h1 className="text-base font-semibold text-white">
            Acceso a la aplicación
          </h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Ingresa la clave para continuar
          </p>
        </div>
        <label htmlFor="app-access-key" className="text-xs text-zinc-400">
          Clave
        </label>
        <input
          id="app-access-key"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void entrar()}
          className="w-full min-h-[50px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
        />
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void entrar()}
          disabled={loading}
          className="w-full min-h-[50px] rounded-xl bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </section>
    </main>
  );
}

export default function AccesoPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh flex items-center justify-center bg-zinc-950">
          <p className="text-sm text-zinc-500">Cargando…</p>
        </main>
      }
    >
      <AccesoForm />
    </Suspense>
  );
}
