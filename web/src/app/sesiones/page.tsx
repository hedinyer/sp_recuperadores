"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { NavFooter } from "@/components/NavFooter";
import { enlaceGoogleMaps } from "@/lib/geolocation";

type Sesion = {
  id: number;
  abierto_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  gps_coords: string;
  foto_frontal_url: string;
  foto_trasera_url: string;
  flash_frontal: boolean;
  flash_trasera: boolean;
  user_agent: string | null;
  viewport: string | null;
  ip: string | null;
};

function ListaSesiones() {
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/access/sesion", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Error");
        setSesiones(data.sesiones ?? []);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudo cargar"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading) {
    return <p className="text-sm text-zinc-500 py-8 text-center">Cargando…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-300 py-8 text-center">
        {error}
      </p>
    );
  }
  if (sesiones.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-8 text-center">
        Nadie ha abierto la app aún.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4 pb-24">
      {sesiones.map((s) => (
        <li
          key={s.id}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 flex flex-col gap-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">
                {new Date(s.abierto_at).toLocaleString("es-CO")}
              </p>
              <a
                href={enlaceGoogleMaps(s.gps_coords)}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-emerald-400 underline"
              >
                {s.gps_coords}
                {s.accuracy_m != null
                  ? ` (±${Number(s.accuracy_m).toFixed(1)} m)`
                  : ""}
              </a>
            </div>
            <span className="text-[10px] text-zinc-500">#{s.id}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.foto_trasera_url}
              alt="Trasera"
              className="rounded-lg aspect-square object-cover bg-zinc-800"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.foto_frontal_url}
              alt="Frontal"
              className="rounded-lg aspect-square object-cover bg-zinc-800"
            />
          </div>
          <p className="text-[10px] text-zinc-500">
            Flash trasera: {s.flash_trasera ? "sí" : "no"} · frontal:{" "}
            {s.flash_frontal ? "sí" : "no"}
            {s.ip ? ` · IP ${s.ip}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function SesionesPage() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-white px-4 pt-6 max-w-[480px] mx-auto">
      <h1 className="text-lg font-semibold mb-1">Quién abrió la app</h1>
      <p className="text-[11px] text-zinc-500 mb-4">
        GPS + fotos al momento de entrar. Solo administradores.
      </p>
      <AdminGate title="Sesiones abiertas" subtitle="Acceso administrador">
        <ListaSesiones />
      </AdminGate>
      <NavFooter />
    </main>
  );
}
