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
    <article className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {kpi.nombre}
        </h3>
        <span
          className={`inline-flex items-center gap-1 text-xs ${
            vivo ? "text-success" : "text-muted-foreground"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              vivo ? "bg-success" : "bg-muted-foreground"
            }`}
            aria-hidden
          />
          {tiempoRelativo(kpi.ultima_at)}
        </span>
      </div>
      <p className="text-base font-semibold leading-tight tabular-nums text-success">
        {formatearCOP(kpi.recaudado_hoy)}
      </p>
      <p className="text-xs tabular-nums text-muted-foreground">
        {kpi.motos_hoy} motos · {kpi.estados_hoy} estados
      </p>
      {kpi.por_status.length > 0 ? (
        <p className="text-xs leading-snug text-muted-foreground">
          {kpi.por_status.map((s) => `${s.label} ${s.n}`).join(" · ")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Nada registrado hoy</p>
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
      <p className="text-xs text-muted-foreground" role="status">
        Recaudo no disponible
      </p>
    );
  }

  if (kpis.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p className="text-xs tabular-nums text-muted-foreground">
        Equipo hoy ·{" "}
        <span className="font-semibold text-success">
          {formatearCOP(recaudadoEquipo)}
        </span>
      </p>
      <div
        className="grid grid-cols-2 gap-2"
        aria-label="Recaudo de hoy Dayana y Jhon Sáenz"
      >
        {kpis.map((kpi) => {
          const t = kpi.ultima_at ? new Date(kpi.ultima_at).getTime() : 0;
          return <KpiCard key={kpi.id} kpi={kpi} vivo={t >= vivoHasta} />;
        })}
      </div>
    </div>
  );
}
