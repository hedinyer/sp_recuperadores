"use client";

import { useCallback, useEffect, useState } from "react";

import type { PerfilKpi } from "@/lib/carteraKpis";
import { formatearCOP } from "@/lib/formatoDinero";

const POLL_MS = 15_000;

function tiempoRelativo(iso: string | null): string {
  if (!iso) return "sin actividad hoy";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "ahora";
  const seg = Math.floor(diff / 1000);
  if (seg < 20) return "ahora";
  if (seg < 60) return `hace ${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

function KpiCard({ kpi, vivo }: { kpi: PerfilKpi; vivo: boolean }) {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white truncate">{kpi.nombre}</h3>
        <span
          className={`inline-flex items-center gap-1 text-[10px] ${
            vivo ? "text-emerald-300" : "text-zinc-500"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              vivo ? "bg-emerald-400" : "bg-zinc-600"
            }`}
            aria-hidden
          />
          {tiempoRelativo(kpi.ultima_at)}
        </span>
      </div>
      <p className="text-base font-semibold text-emerald-300 tabular-nums leading-tight">
        {formatearCOP(kpi.recaudado_hoy)}
      </p>
      <p className="text-[11px] text-zinc-400 tabular-nums">
        {kpi.motos_hoy} motos · {kpi.estados_hoy} estados
      </p>
      {kpi.por_status.length > 0 ? (
        <p className="text-[11px] text-zinc-500 leading-snug">
          {kpi.por_status.map((s) => `${s.label} ${s.n}`).join(" · ")}
        </p>
      ) : (
        <p className="text-[11px] text-zinc-600">Nada registrado hoy</p>
      )}
    </article>
  );
}

export function KpisCarteraHoy({ tick = 0 }: { tick?: number }) {
  const [kpis, setKpis] = useState<PerfilKpi[]>([]);
  const [recaudadoEquipo, setRecaudadoEquipo] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/cartera/kpis", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar");
      setKpis(data.kpis ?? []);
      setRecaudadoEquipo(Number(data.recaudado_equipo) || 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error KPI");
    }
  }, []);

  useEffect(() => {
    void cargar();
    const id = setInterval(() => void cargar(), POLL_MS);
    return () => clearInterval(id);
  }, [cargar, tick]);

  const vivoHasta = Date.now() - 20 * 60 * 1000;

  if (error && kpis.length === 0) {
    return (
      <p className="mt-3 text-[11px] text-zinc-500" role="status">
        KPIs no disponibles
      </p>
    );
  }

  if (kpis.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2" aria-live="polite">
      <p className="text-xs text-zinc-400 tabular-nums">
        Equipo hoy ·{" "}
        <span className="font-semibold text-emerald-300">
          {formatearCOP(recaudadoEquipo)}
        </span>
      </p>
      <div
        className="grid grid-cols-2 gap-2"
        aria-label="Recaudo de hoy Dayana y Jhon Sáenz"
      >
        {kpis.map((kpi) => {
          const t = kpi.ultima_at ? new Date(kpi.ultima_at).getTime() : 0;
          return (
            <KpiCard key={kpi.id} kpi={kpi} vivo={t >= vivoHasta} />
          );
        })}
      </div>
    </div>
  );
}
