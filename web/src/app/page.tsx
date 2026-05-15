"use client";

import { useCallback, useState } from "react";

type Vehiculo = Record<string, string>;

function formatearCOP(val: string | undefined): string {
  if (val == null || val === "") return "—";
  const n = Number(String(val).replace(/,/g, ""));
  if (Number.isNaN(n)) return val;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function enlaceWhatsApp(telefono: string | undefined): string | null {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, "");
  if (!digits) return null;
  const conPais = digits.startsWith("57")
    ? digits
    : digits.startsWith("0")
      ? `57${digits.slice(1)}`
      : `57${digits}`;
  return `https://wa.me/${conPais}`;
}

function estadoMora(dias: string | undefined): { label: string; tone: string } {
  const d = parseInt(String(dias ?? "0"), 10) || 0;
  if (d <= 7) return { label: "Al día", tone: "ok" };
  if (d <= 15) return { label: "Próximo a vencer", tone: "warn" };
  if (d <= 30) return { label: "Mora leve", tone: "mid" };
  return { label: "Mora crítica", tone: "bad" };
}

export default function Home() {
  const [placa, setPlaca] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<Vehiculo | null>(null);

  const consultar = useCallback(async () => {
    const p = placa.trim();
    if (!p) {
      setError("Escribe una placa");
      return;
    }
    setLoading(true);
    setError(null);
    setV(null);
    try {
      const res = await fetch(
        `/api/placa?placa=${encodeURIComponent(p)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al consultar");
        return;
      }
      setV(data.vehiculo as Vehiculo);
    } catch {
      setError("Sin conexión o error de red");
    } finally {
      setLoading(false);
    }
  }, [placa]);

  const mora = v ? estadoMora(v.dias_mora) : null;

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="px-4 pb-2 border-b border-zinc-800/80">
        <h1 className="text-lg font-semibold tracking-tight text-white">
          Consulta por placa
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Datos del reporte actual (CSV)
        </p>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="placa" className="text-sm text-zinc-400">
            Placa del vehículo
          </label>
          <div className="flex gap-2">
            <input
              id="placa"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Ej. ABC12D"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && consultar()}
              className="flex-1 min-h-[48px] rounded-xl bg-zinc-900 border border-zinc-700 px-4 text-base font-medium tracking-wide text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={consultar}
              disabled={loading}
              className="min-h-[48px] min-w-[96px] rounded-xl bg-emerald-600 text-white font-medium text-sm px-4 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? "…" : "Buscar"}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {v && mora && (
          <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden shadow-xl shadow-black/20">
            <div className="px-4 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wider text-zinc-500">
                Placa
              </span>
              <span className="text-xl font-bold tracking-widest text-white">
                {(v.placa || "—").toUpperCase()}
              </span>
            </div>

            <div
              className={`px-4 py-2 text-center text-sm font-medium border-b border-zinc-800 ${
                mora.tone === "ok"
                  ? "bg-emerald-950/50 text-emerald-300"
                  : mora.tone === "warn"
                    ? "bg-amber-950/50 text-amber-200"
                    : mora.tone === "mid"
                      ? "bg-yellow-950/40 text-yellow-200"
                      : "bg-red-950/50 text-red-200"
              }`}
            >
              {mora.label}
            </div>

            <dl className="p-4 grid gap-3 text-sm">
              <div className="grid gap-0.5">
                <dt className="text-zinc-500 text-xs">Cliente</dt>
                <dd className="text-zinc-100 font-medium leading-snug">
                  {v.nombre || "—"}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-zinc-500 text-xs">Cédula</dt>
                  <dd className="text-zinc-200 tabular-nums">{v.cedula || "—"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 text-xs">Teléfono</dt>
                  <dd className="text-zinc-200 tabular-nums">
                    {v.telefono || "—"}
                  </dd>
                  {enlaceWhatsApp(v.telefono) ? (
                    <a
                      href={enlaceWhatsApp(v.telefono)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 text-sm font-medium text-white active:scale-[0.98] transition-transform"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>
              <div>
                <dt className="text-zinc-500 text-xs">Visitador</dt>
                <dd className="text-zinc-200">{v.visitador || "—"}</dd>
              </div>
              <hr className="border-zinc-800" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-zinc-500 text-xs">Inicio</dt>
                  <dd className="text-zinc-200">{v.fecha_inicio || "—"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 text-xs">Valor cuota</dt>
                  <dd className="text-zinc-200">
                    {formatearCOP(v.valor_cuota)}
                  </dd>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-zinc-950/80 p-2 border border-zinc-800">
                  <span className="text-zinc-500 block">Cuotas gen.</span>
                  <span className="text-zinc-100 font-medium">
                    {v.cuotas_generadas ?? "—"}
                  </span>
                </div>
                <div className="rounded-lg bg-zinc-950/80 p-2 border border-zinc-800">
                  <span className="text-zinc-500 block">Pagadas</span>
                  <span className="text-zinc-100 font-medium">
                    {v.cuotas_pagadas ?? "—"}
                  </span>
                </div>
                <div className="rounded-lg bg-zinc-950/80 p-2 border border-zinc-800">
                  <span className="text-zinc-500 block">Pendientes</span>
                  <span className="text-zinc-100 font-medium">
                    {v.cuotas_pendientes ?? "—"}
                  </span>
                </div>
                <div className="rounded-lg bg-zinc-950/80 p-2 border border-zinc-800">
                  <span className="text-zinc-500 block">Cumplimiento</span>
                  <span className="text-zinc-100 font-medium">
                    {v.cumplimiento_pct != null && v.cumplimiento_pct !== ""
                      ? `${v.cumplimiento_pct}%`
                      : "—"}
                  </span>
                </div>
              </div>
              <div className="grid gap-1">
                <dt className="text-zinc-500 text-xs">Total pagado</dt>
                <dd className="text-emerald-400 font-semibold">
                  {formatearCOP(v.total_pagado)}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-zinc-500 text-xs">Deuda total</dt>
                <dd className="text-rose-400 font-semibold">
                  {formatearCOP(v.deuda_total)}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-zinc-500 text-xs">Último pago</dt>
                  <dd className="text-zinc-200">{v.ultimo_pago || "Nunca"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500 text-xs">Días mora</dt>
                  <dd className="text-zinc-200 font-medium">{v.dias_mora ?? "—"}</dd>
                </div>
              </div>
            </dl>
          </article>
        )}
      </main>
    </div>
  );
}
