"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, EyeIcon, EyeOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LOTE_17_METRICAS_CLAVE,
  LOTE_17_METRICAS_STORAGE_KEY,
  type Lote17Metricas,
  type Lote17MetricasPerfil,
} from "@/lib/carteraLotes17Types";
import { formatearCOP } from "@/lib/formatoDinero";
import { cn } from "@/lib/utils";

const POLL_MS = 12_000;

function PerfilMetricasCard({ m }: { m: Lote17MetricasPerfil }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{m.nombre}</h3>
          {m.etiqueta ? (
            <p className="text-[11px] text-muted-foreground">{m.etiqueta}</p>
          ) : null}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {m.n_placas} placas
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/50 px-2.5 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            Cartera asignada
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
            {formatearCOP(m.cartera_total)}
          </p>
        </div>
        <div className="rounded-lg bg-success/10 px-2.5 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            Recaudado hoy
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-success">
            {formatearCOP(m.recaudado_hoy)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs tabular-nums text-muted-foreground">
        <span>
          En el lote:{" "}
          <span className="font-semibold text-foreground">
            {formatearCOP(m.recaudado_lote)}
          </span>
        </span>
        <span>
          {m.motos_con_abono_lote} con pago · {m.pct_recuperado}%
        </span>
      </div>
    </article>
  );
}

/** Métricas abiertas para Admin Nicolas: Jhon, James y él. */
export function LoteAdminMetricasPanel({ tick = 0 }: { tick?: number }) {
  const [perfiles, setPerfiles] = useState<Lote17MetricasPerfil[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cartera/lotes-17/metricas-admin", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar");
      setPerfiles((data.por_perfil as Lote17MetricasPerfil[]) ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar métricas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const id = window.setInterval(() => void cargar(), POLL_MS);
    return () => window.clearInterval(id);
  }, [cargar, tick]);

  return (
    <div
      className="flex flex-col gap-2.5 rounded-2xl border border-border bg-muted/30 px-3.5 py-3"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          Métricas del equipo
        </p>
        <span className="text-[11px] text-muted-foreground">
          {loading ? "Actualizando…" : "En vivo"}
        </span>
      </div>
      {error && perfiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : null}
      {perfiles.map((p) => (
        <PerfilMetricasCard key={p.id} m={p} />
      ))}
    </div>
  );
}

export function Lote17MetricasPanel({ tick = 0 }: { tick?: number }) {
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [pedirClave, setPedirClave] = useState(false);
  const [clave, setClave] = useState("");
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const [metricas, setMetricas] = useState<Lote17Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(LOTE_17_METRICAS_STORAGE_KEY) === "1") {
        setDesbloqueado(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const cargar = useCallback(async () => {
    if (!desbloqueado) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/cartera/lotes-17/metricas?clave=${encodeURIComponent(LOTE_17_METRICAS_CLAVE)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar");
      setMetricas(data as Lote17Metricas);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar métricas");
    } finally {
      setLoading(false);
    }
  }, [desbloqueado]);

  useEffect(() => {
    if (!desbloqueado) return;
    void cargar();
    const id = window.setInterval(() => void cargar(), POLL_MS);
    return () => window.clearInterval(id);
  }, [desbloqueado, cargar, tick]);

  const intentarAbrir = () => {
    if (desbloqueado) {
      setDesbloqueado(false);
      setPedirClave(false);
      setMetricas(null);
      try {
        sessionStorage.removeItem(LOTE_17_METRICAS_STORAGE_KEY);
      } catch {
        // ignore
      }
      return;
    }
    setPedirClave(true);
    setErrorClave(null);
    setClave("");
  };

  const validarClave = (e: React.FormEvent) => {
    e.preventDefault();
    if (clave.trim() !== LOTE_17_METRICAS_CLAVE) {
      setErrorClave("Clave incorrecta");
      return;
    }
    setErrorClave(null);
    setPedirClave(false);
    setDesbloqueado(true);
    try {
      sessionStorage.setItem(LOTE_17_METRICAS_STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-muted/30">
      <button
        type="button"
        onClick={intentarAbrir}
        className="flex h-12 w-full items-center justify-between gap-2 rounded-2xl px-3.5 text-left text-sm font-semibold text-foreground touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="inline-flex items-center gap-2">
          {desbloqueado ? (
            <EyeOffIcon className="size-4" aria-hidden />
          ) : (
            <EyeIcon className="size-4" aria-hidden />
          )}
          {desbloqueado ? "Ocultar métricas" : "Ver métricas de cartera"}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            desbloqueado && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {pedirClave && !desbloqueado ? (
        <form
          onSubmit={validarClave}
          className="flex flex-col gap-2 border-t border-border px-3.5 pb-3.5 pt-2"
        >
          <Label htmlFor="lote17-metricas-clave">Clave numérica</Label>
          <Input
            id="lote17-metricas-clave"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={clave}
            onChange={(e) => setClave(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="····"
            className="h-12 text-center text-lg tracking-[0.3em] tabular-nums"
            autoFocus
          />
          {errorClave ? (
            <p className="text-sm text-destructive" role="alert">
              {errorClave}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Solo con la clave se ven los totales de Jhon y James.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-xl"
              onClick={() => {
                setPedirClave(false);
                setClave("");
                setErrorClave(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" className="h-11 flex-1 rounded-xl">
              Entrar
            </Button>
          </div>
        </form>
      ) : null}

      {desbloqueado ? (
        <div
          className="flex flex-col gap-2.5 border-t border-border px-3.5 pb-3.5 pt-3"
          aria-live="polite"
        >
          {error && !metricas ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : null}

          {metricas ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Cartera total
                  </p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-foreground">
                    {formatearCOP(metricas.equipo.cartera_total)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {metricas.equipo.n_placas} placas
                  </p>
                </div>
                <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Recaudado hoy
                  </p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-success">
                    {formatearCOP(metricas.equipo.recaudado_hoy)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    Lote: {formatearCOP(metricas.equipo.recaudado_lote)} ·{" "}
                    {metricas.equipo.pct_recuperado}%
                  </p>
                </div>
              </div>

              {metricas.por_perfil.map((p) => (
                <PerfilMetricasCard key={p.id} m={p} />
              ))}

              <p className="text-[11px] tabular-nums text-muted-foreground">
                {loading ? "Actualizando…" : "En vivo"} · abonos y pagos ERP de
                las placas del lote en estos 4 días
              </p>
            </>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Cargando métricas…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
