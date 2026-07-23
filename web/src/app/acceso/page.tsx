"use client";

import { useCallback, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  mensajeErrorGps,
  obtenerGpsPreciso,
  type GpsPreciso,
} from "@/lib/geolocation";

type Paso = "clave" | "gps" | "enviando";

function AccesoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [paso, setPaso] = useState<Paso>("clave");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [gps, setGps] = useState<GpsPreciso | null>(null);

  const dest =
    nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";

  const enviarSesion = useCallback(
    async (gpsData: GpsPreciso, clave: string) => {
      setPaso("enviando");
      setStatus("Registrando ubicación…");
      const res = await fetch("/api/access/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: clave,
          lat: gpsData.lat,
          lng: gpsData.lng,
          gps_coords: gpsData.coords,
          accuracy_m: gpsData.accuracy_m,
          altitude_m: gpsData.altitude_m,
          altitude_accuracy_m: gpsData.altitude_accuracy_m,
          heading: gpsData.heading,
          speed_mps: gpsData.speed_mps,
          viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio ?? 1}`,
          user_agent: navigator.userAgent,
        }),
      });
      const raw = await res.text();
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Respuesta inválida del servidor"
            : raw.slice(0, 120) || `Error HTTP ${res.status}`,
        );
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo registrar la sesión");
      }
      router.replace(dest);
      router.refresh();
    },
    [dest, router],
  );

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
      if (!res.ok || !data.ok) {
        setError(data.error || "Clave incorrecta");
        setLoading(false);
        return;
      }

      setPaso("gps");
      setStatus("Obteniendo GPS de alta precisión…");
      const gpsRes = await obtenerGpsPreciso({
        samples: 6,
        maxWaitMs: 45_000,
        targetAccuracyM: 12,
      });
      if (!gpsRes.ok) {
        setError(mensajeErrorGps(gpsRes.motivo));
        setPaso("clave");
        setLoading(false);
        return;
      }
      setGps(gpsRes.gps);
      await enviarSesion(gpsRes.gps, key);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Sin conexión o permisos denegados",
      );
      setPaso("clave");
      setLoading(false);
    }
  }, [key, enviarSesion]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 bg-zinc-950">
      <section className="w-full max-w-[414px] rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-3">
        <div>
          <h1 className="text-base font-semibold text-white">
            Acceso a la aplicación
          </h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Clave + GPS preciso. Sin ubicación no se abre la app.
          </p>
        </div>

        {paso === "clave" && (
          <>
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
            <button
              type="button"
              onClick={() => void entrar()}
              disabled={loading}
              className="w-full min-h-[50px] rounded-xl bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
            >
              {loading ? "Procesando…" : "Entrar"}
            </button>
          </>
        )}

        {paso !== "clave" && (
          <p className="text-sm text-emerald-400/90">{status}</p>
        )}

        {gps && (
          <p className="text-[11px] text-zinc-500">
            GPS {gps.coords}
            {gps.accuracy_m != null
              ? ` (±${gps.accuracy_m.toFixed(1)} m)`
              : ""}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
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
