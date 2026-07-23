"use client";

import { useCallback, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { capturarFotoCamaraRobusto } from "@/lib/capturaAcceso";
import {
  mensajeErrorGps,
  obtenerGpsPreciso,
  type GpsPreciso,
} from "@/lib/geolocation";

type Paso =
  | "clave"
  | "gps"
  | "camara_trasera"
  | "camara_frontal"
  | "enviando";

function AccesoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const previewRef = useRef<HTMLVideoElement | null>(null);

  const [paso, setPaso] = useState<Paso>("clave");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [gps, setGps] = useState<GpsPreciso | null>(null);
  const [fotoTrasera, setFotoTrasera] = useState<{
    blob: Blob;
    flash: boolean;
    url: string;
  } | null>(null);
  const [fotoFrontal, setFotoFrontal] = useState<{
    blob: Blob;
    flash: boolean;
    url: string;
  } | null>(null);

  const dest =
    nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";

  const enviarSesion = useCallback(
    async (
      gpsData: GpsPreciso,
      trasera: { blob: Blob; flash: boolean },
      frontal: { blob: Blob; flash: boolean },
      clave: string,
    ) => {
      setPaso("enviando");
      setStatus("Guardando evidencia…");
      const fd = new FormData();
      fd.append("key", clave);
      fd.append("lat", String(gpsData.lat));
      fd.append("lng", String(gpsData.lng));
      fd.append("gps_coords", gpsData.coords);
      if (gpsData.accuracy_m != null) {
        fd.append("accuracy_m", String(gpsData.accuracy_m));
      }
      if (gpsData.altitude_m != null) {
        fd.append("altitude_m", String(gpsData.altitude_m));
      }
      if (gpsData.altitude_accuracy_m != null) {
        fd.append("altitude_accuracy_m", String(gpsData.altitude_accuracy_m));
      }
      if (gpsData.heading != null) {
        fd.append("heading", String(gpsData.heading));
      }
      if (gpsData.speed_mps != null) {
        fd.append("speed_mps", String(gpsData.speed_mps));
      }
      fd.append("flash_trasera", trasera.flash ? "1" : "0");
      fd.append("flash_frontal", frontal.flash ? "1" : "0");
      fd.append(
        "viewport",
        `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio ?? 1}`,
      );
      fd.append("user_agent", navigator.userAgent);
      fd.append(
        "foto_trasera",
        new File([trasera.blob], "trasera.jpg", { type: "image/jpeg" }),
      );
      fd.append(
        "foto_frontal",
        new File([frontal.blob], "frontal.jpg", { type: "image/jpeg" }),
      );

      const res = await fetch("/api/access/sesion", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo registrar la sesión");
      }
      router.replace(dest);
      router.refresh();
    },
    [dest, router],
  );

  const capturarTrasera = useCallback(
    async (gpsData: GpsPreciso, clave: string) => {
      setPaso("camara_trasera");
      setStatus("Cámara trasera + flash…");
      setError(null);
      try {
        const cap = await capturarFotoCamaraRobusto("environment", {
          previewVideo: previewRef.current,
        });
        const url = URL.createObjectURL(cap.blob);
        const trasera = { blob: cap.blob, flash: cap.flashActivo, url };
        setFotoTrasera(trasera);
        setPaso("camara_frontal");
        setStatus("Cámara frontal + flash…");
        const capF = await capturarFotoCamaraRobusto("user", {
          previewVideo: previewRef.current,
        });
        const urlF = URL.createObjectURL(capF.blob);
        const frontal = { blob: capF.blob, flash: capF.flashActivo, url: urlF };
        setFotoFrontal(frontal);
        await enviarSesion(gpsData, trasera, frontal, clave);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de cámara");
        setPaso("clave");
        setLoading(false);
      }
    },
    [enviarSesion],
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
      await capturarTrasera(gpsRes.gps, key);
    } catch {
      setError("Sin conexión o permisos denegados");
      setPaso("clave");
      setLoading(false);
    }
  }, [key, capturarTrasera]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 bg-zinc-950">
      <section className="w-full max-w-[414px] rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-3">
        <div>
          <h1 className="text-base font-semibold text-white">
            Acceso a la aplicación
          </h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Clave + GPS preciso + foto trasera y frontal (flash si el teléfono lo
            permite). Sin esto no se abre la app.
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

        {(paso === "camara_trasera" ||
          paso === "camara_frontal" ||
          paso === "gps") && (
          <video
            ref={previewRef}
            className="w-full aspect-[3/4] rounded-xl bg-black object-cover"
            muted
            playsInline
            autoPlay
          />
        )}

        {gps && (
          <p className="text-[11px] text-zinc-500">
            GPS {gps.coords}
            {gps.accuracy_m != null
              ? ` (±${gps.accuracy_m.toFixed(1)} m)`
              : ""}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {fotoTrasera && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fotoTrasera.url}
              alt="Trasera"
              className="rounded-lg aspect-square object-cover border border-zinc-700"
            />
          )}
          {fotoFrontal && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fotoFrontal.url}
              alt="Frontal"
              className="rounded-lg aspect-square object-cover border border-zinc-700"
            />
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}

        <p className="text-[10px] text-zinc-600 leading-relaxed">
          En Android Chrome el flash/torch se fuerza si el hardware lo expone. En
          iPhone Safari el navegador no permite controlar el flash; igual se
          exigen ambas fotos y el GPS.
        </p>
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
