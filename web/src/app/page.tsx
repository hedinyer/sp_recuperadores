"use client";

import { useCallback, useRef, useState } from "react";
import { toPng } from "html-to-image";

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

function formatFechaCorta(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!d) return iso;
  return `${d}/${m}/${y?.slice(2) ?? y}`;
}

function StatMini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-3 min-w-0 text-center">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500 leading-tight">
        {label}
      </span>
      <span
        className={`mt-1 text-sm font-semibold tabular-nums leading-tight ${
          accent ? "text-amber-400" : "text-zinc-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function Home() {
  const [placa, setPlaca] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<Vehiculo | null>(null);

  const [showPagoForm, setShowPagoForm] = useState(false);
  const [montoPago, setMontoPago] = useState("");
  const [montoMulta, setMontoMulta] = useState("");
  const [recibo, setRecibo] = useState<{
    referencia: string;
    fecha: string;
    cliente: string;
    cedula: string;
    placa: string;
    montoPago: number;
    montoMulta: number;
    total: number;
  } | null>(null);

  const reciboRef = useRef<HTMLDivElement>(null);

  const consultar = useCallback(async () => {
    const p = placa.trim();
    if (!p) {
      setError("Escribe una placa");
      return;
    }
    setLoading(true);
    setError(null);
    setV(null);
    setRecibo(null);
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

  const generarRecibo = useCallback(() => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const rand = String(Math.floor(10000 + Math.random() * 90000));
    const referencia = `${dd}${mm}${yy}${rand}`;

    const pago = parseFloat(montoPago) || 0;
    const multa = parseFloat(montoMulta) || 0;

    setRecibo({
      referencia,
      fecha: `${dd}/${mm}/${String(now.getFullYear())}`,
      cliente: v?.nombre || "—",
      cedula: v?.cedula || "—",
      placa: (v?.placa || "—").toUpperCase().replace(/\s/g, ""),
      montoPago: pago,
      montoMulta: multa,
      total: pago - multa,
    });
    setShowPagoForm(false);
    setMontoPago("");
    setMontoMulta("");
  }, [montoPago, montoMulta, v]);

  const compartirReciboWpp = useCallback(async () => {
    if (!recibo) return;

    const texto = `🧾 *RECIBO DE PAGO*
─────────────────
Cliente: ${recibo.cliente}
Cédula: ${recibo.cedula}
Placa: ${recibo.placa}
Fecha: ${recibo.fecha}
─────────────────
Abono: ${formatearCOP(String(recibo.montoPago))}
Multa: ${formatearCOP(String(recibo.montoMulta))}
*Neto abonado: ${formatearCOP(String(recibo.total))}*
─────────────────
*Ref: ${recibo.referencia}*
─────────────────`;

    if (reciboRef.current) {
      try {
        const dataUrl = await toPng(reciboRef.current, {
          backgroundColor: "#09090b",
          pixelRatio: 2,
        });
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `recibo_${recibo.referencia}.png`, {
          type: "image/png",
        });
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Recibo ${recibo.referencia}`,
            text: texto,
            files: [file],
          });
          return;
        }
      } catch {
        // fallback a texto
      }
    }

    const urlWpp = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(urlWpp, "_blank", "noopener,noreferrer");
  }, [recibo]);

  const descargarRecibo = useCallback(async () => {
    if (!reciboRef.current || !recibo) return;
    const dataUrl = await toPng(reciboRef.current, {
      backgroundColor: "#09090b",
      pixelRatio: 2,
    });
    const link = document.createElement("a");
    link.download = `recibo_${recibo.referencia}.png`;
    link.href = dataUrl;
    link.click();
  }, [recibo]);

  const wa = v ? enlaceWhatsApp(v.telefono) : null;
  const diasMora = v ? parseInt(String(v.dias_mora ?? "0"), 10) || 0 : 0;
  const cuotasPend = v?.cuotas_pendientes
    ? parseFloat(v.cuotas_pendientes)
    : null;

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="shrink-0 px-4 pb-3 border-b border-zinc-800/80">
        <h1 className="text-base font-semibold tracking-tight text-white">
          Consulta por placa
        </h1>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Deuda y contacto del cliente
        </p>
      </header>

      <main className="flex-1 w-full max-w-[414px] mx-auto px-3 sm:px-4 pt-3 flex flex-col gap-3 min-h-0">
        <div className="shrink-0 flex flex-col gap-1.5">
          <label htmlFor="placa" className="text-xs text-zinc-400 pl-0.5">
            Placa
          </label>
          <div className="flex gap-2">
            <input
              id="placa"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Ej. TIJ66H"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && consultar()}
              className="flex-1 min-h-[50px] rounded-xl bg-zinc-900 border border-zinc-700 px-3.5 text-lg font-semibold tracking-[0.12em] text-white placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={consultar}
              disabled={loading}
              className="shrink-0 min-h-[50px] min-w-[88px] rounded-xl bg-emerald-600 text-white font-semibold text-sm px-4 disabled:opacity-50 active:scale-[0.98] transition-transform touch-manipulation"
            >
              {loading ? "…" : "Buscar"}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="shrink-0 rounded-xl border border-red-900/60 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {v && (
          <>
            <article className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-lg shadow-black/30">
              {/* Placa */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-zinc-900 border-b border-zinc-800">
                <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                  Moto
                </span>
                <span className="text-2xl font-bold tracking-[0.2em] text-white">
                  {(v.placa || "—").toUpperCase().replace(/\s/g, "")}
                </span>
              </div>

              {/* Deuda */}
              <section className="px-4 pt-4 pb-3 bg-gradient-to-b from-rose-950/70 via-rose-950/30 to-transparent border-b border-zinc-800/80">
                <p className="text-[11px] font-medium uppercase tracking-wider text-rose-300/90">
                  Valor para estar al día
                </p>
                <p className="mt-1 text-[clamp(1.75rem,8vw,2.25rem)] font-bold text-rose-400 tabular-nums leading-none tracking-tight">
                  {formatearCOP(v.deuda_total)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {diasMora > 0 && (
                    <span className="inline-flex items-center rounded-full bg-amber-950/80 border border-amber-800/60 px-2.5 py-1 text-xs font-medium text-amber-200">
                      {diasMora} {diasMora === 1 ? "día" : "días"} sin pagar
                    </span>
                  )}
                  {cuotasPend != null && cuotasPend > 0 && (
                    <span className="inline-flex items-center rounded-full bg-zinc-800/90 border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300">
                      {cuotasPend % 1 === 0
                        ? cuotasPend.toFixed(0)
                        : cuotasPend.toFixed(1)}{" "}
                      cuotas pend.
                    </span>
                  )}
                </div>
              </section>

              {/* Resumen rápido */}
              <section className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800 bg-zinc-900/40">
                <StatMini
                  label="Mora"
                  value={diasMora > 0 ? `${diasMora} d` : "0"}
                  accent={diasMora > 7}
                />
                <StatMini
                  label="Últ. pago"
                  value={formatFechaCorta(v.ultimo_pago)}
                />
                <StatMini
                  label="Cuota"
                  value={formatearCOP(v.valor_cuota).replace(/\s/g, "\u00a0")}
                />
              </section>

              {/* Cliente */}
              <section className="px-4 py-3.5 border-b border-zinc-800">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5">
                  Cliente
                </h2>
                <p className="text-base font-semibold text-zinc-50 leading-snug break-words">
                  {v.nombre || "—"}
                </p>
                <p className="mt-1.5 text-sm text-zinc-400 tabular-nums">
                  CC{" "}
                  <span className="text-zinc-200 font-medium">
                    {v.cedula || "—"}
                  </span>
                </p>
                {v.visitador && v.visitador !== "-" ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Visitador:{" "}
                    <span className="text-zinc-400">{v.visitador}</span>
                  </p>
                ) : null}
              </section>

              {/* Contacto */}
              <section className="px-4 py-3.5 flex flex-col gap-2.5">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Contacto
                </h2>
                {v.telefono ? (
                  <a
                    href={`tel:${v.telefono.replace(/\s/g, "")}`}
                    className="flex items-center justify-center min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-800/50 text-base font-medium text-zinc-100 tabular-nums active:bg-zinc-800 touch-manipulation"
                  >
                    {v.telefono}
                  </a>
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-2">
                    Sin teléfono registrado
                  </p>
                )}
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 min-h-[50px] w-full rounded-xl bg-[#25D366] text-base font-semibold text-white shadow-md shadow-[#25D366]/20 active:scale-[0.98] transition-transform touch-manipulation"
                  >
                    <svg
                      aria-hidden
                      className="w-5 h-5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Escribir por WhatsApp
                  </a>
                ) : null}
              </section>

              {/* Contrato */}
              <footer className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 bg-zinc-950/60 border-t border-zinc-800 text-xs">
                <div>
                  <span className="text-zinc-500">Inicio contrato</span>
                  <p className="mt-0.5 font-medium text-zinc-300 tabular-nums">
                    {formatFechaCorta(v.fecha_inicio)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-zinc-500">Cuotas pagadas</span>
                  <p className="mt-0.5 font-medium text-zinc-300 tabular-nums">
                    {v.cuotas_pagadas ?? "—"} / {v.cuotas_generadas ?? "—"}
                  </p>
                </div>
              </footer>
            </article>

            {/* Botón Generar Pago */}
            <button
              type="button"
              onClick={() => setShowPagoForm(true)}
              className="w-full min-h-[50px] rounded-xl bg-emerald-700 text-white font-semibold text-base active:scale-[0.98] transition-transform touch-manipulation shadow-lg shadow-emerald-900/30"
            >
              Generar Pago
            </button>
          </>
        )}

        {/* Recibo generado */}
        {recibo && (
          <div className="flex flex-col gap-3">
            <div
              ref={reciboRef}
              className="flex flex-col rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-lg shadow-black/30 select-none"
            >
              <div className="text-center border-b border-zinc-700 pb-3 mb-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                  Recibo de Pago
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">{recibo.fecha}</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Cliente</span>
                  <span className="text-zinc-100 font-medium text-right max-w-[60%]">
                    {recibo.cliente}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Cédula</span>
                  <span className="text-zinc-100 font-medium">
                    {recibo.cedula}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Placa</span>
                  <span className="text-zinc-100 font-medium tracking-widest">
                    {recibo.placa}
                  </span>
                </div>
              </div>

              <div className="border-t border-zinc-700 my-3 pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Abono</span>
                  <span className="text-zinc-100 font-medium tabular-nums">
                    {formatearCOP(String(recibo.montoPago))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Multa</span>
                  <span className="text-amber-400 font-medium tabular-nums">
                    {formatearCOP(String(recibo.montoMulta))}
                  </span>
                </div>
                <div className="flex justify-between border-t border-zinc-700 pt-2">
                  <span className="text-zinc-300 font-semibold">Neto abonado</span>
                  <span className="text-emerald-400 font-bold text-base tabular-nums">
                    {formatearCOP(String(recibo.total))}
                  </span>
                </div>
              </div>

              <div className="border-t border-zinc-700 pt-3 mt-1 text-center">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Referencia
                </p>
                <p className="text-lg font-bold tracking-[0.15em] text-white">
                  {recibo.referencia}
                </p>
              </div>
            </div>

            {/* Botones del recibo */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={compartirReciboWpp}
                className="flex-1 min-h-[50px] rounded-xl bg-[#25D366] text-white font-semibold text-sm active:scale-[0.98] transition-transform touch-manipulation shadow-md shadow-[#25D366]/20 flex items-center justify-center gap-2"
              >
                <svg
                  aria-hidden
                  className="w-5 h-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Compartir
              </button>
              <button
                type="button"
                onClick={descargarRecibo}
                className="flex-1 min-h-[50px] rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-100 font-semibold text-sm active:scale-[0.98] transition-transform touch-manipulation flex items-center justify-center gap-2"
              >
                <svg
                  aria-hidden
                  className="w-5 h-5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Descargar
              </button>
            </div>
          </div>
        )}

        {/* Modal formulario de pago */}
        {showPagoForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="w-full max-w-[400px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
              <h2 className="text-base font-semibold text-white mb-4">
                Generar recibo de pago
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 pl-0.5 block mb-1">
                    Valor del abono ($)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 pl-0.5 block mb-1">
                    Valor de la multa ($)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={montoMulta}
                    onChange={(e) => setMontoMulta(e.target.value)}
                    className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setShowPagoForm(false);
                    setMontoPago("");
                    setMontoMulta("");
                  }}
                  className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm active:scale-[0.98] transition-transform touch-manipulation"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={generarRecibo}
                  className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold text-sm active:scale-[0.98] transition-transform touch-manipulation"
                >
                  Generar recibo
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
