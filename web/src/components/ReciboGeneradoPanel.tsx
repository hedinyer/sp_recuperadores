"use client";

import type { RefObject } from "react";

import { FotoComprobante } from "@/components/FotoComprobante";
import { formatearCOP } from "@/lib/formatoDinero";
import { etiquetaRecuperador } from "@/lib/recuperadores";
import type { ReciboData } from "@/lib/reciboTypes";

type Props = {
  recibo: ReciboData;
  reciboRef: RefObject<HTMLDivElement | null>;
  exportandoRecibo: boolean;
  confirmandoRecuperada?: boolean;
  onCompartir: () => void;
  onDescargar: () => void;
  onConfirmarRecuperada?: () => void;
};

export function ReciboGeneradoPanel({
  recibo,
  reciboRef,
  exportandoRecibo,
  confirmandoRecuperada,
  onCompartir,
  onDescargar,
  onConfirmarRecuperada,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div
        ref={reciboRef}
        className="flex flex-col rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-lg shadow-black/30 select-none"
      >
        <div className="text-center border-b border-zinc-700 pb-3 mb-3">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            {recibo.tipo === "pago"
              ? "Recibo de Pago"
              : "Recibo de Moto Recuperada"}
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
            <span className="text-zinc-400">Recuperador</span>
            <span className="text-zinc-100 font-medium text-right max-w-[60%]">
              {etiquetaRecuperador(recibo.recuperador)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Cédula</span>
            <span className="text-zinc-100 font-medium">{recibo.cedula}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Placa</span>
            <span className="text-zinc-100 font-medium tracking-widest">
              {recibo.placa}
            </span>
          </div>
        </div>

        {recibo.tipo === "pago" && (
          <div className="border-t border-zinc-700 my-3 pt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Método</span>
              <span className="text-zinc-100 font-medium">
                {recibo.tipoPago ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Modalidad</span>
              <span className="text-zinc-100 font-medium">
                {recibo.presencial ? "Presencial" : "Remoto"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Abono</span>
              <span className="text-zinc-100 font-medium tabular-nums">
                {formatearCOP(recibo.montoPago)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Multa</span>
              <span className="text-amber-400 font-medium tabular-nums">
                {formatearCOP(recibo.montoMulta)}
              </span>
            </div>
            <div className="flex justify-between border-t border-zinc-700 pt-2">
              <span className="text-zinc-300 font-semibold">Neto abonado</span>
              <span className="text-emerald-400 font-bold text-base tabular-nums">
                {formatearCOP(recibo.total)}
              </span>
            </div>
            {(recibo.fotoLocal ?? recibo.fotoUrl) ? (
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 text-center">
                  Comprobante presencial
                </p>
                <FotoComprobante
                  placa={recibo.placa}
                  fotoLocal={recibo.fotoLocal}
                  fotoRemota={recibo.fotoUrl}
                  className="w-full rounded-xl border border-zinc-700 object-cover max-h-48 bg-zinc-800"
                  alt="Foto del pago presencial"
                />
              </div>
            ) : null}
          </div>
        )}

        {recibo.gpsUbicacion ? (
          <p className="text-[10px] text-zinc-500 text-center mt-2 tabular-nums">
            GPS: {recibo.gpsUbicacion}
          </p>
        ) : null}

        <div className="border-t border-zinc-700 pt-3 mt-1 text-center">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Referencia
          </p>
          <p className="text-lg font-bold tracking-[0.15em] text-white">
            {recibo.referencia}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCompartir}
          disabled={exportandoRecibo}
          className="flex-1 min-h-[50px] rounded-xl bg-[#25D366] text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform touch-manipulation shadow-md shadow-[#25D366]/20 flex items-center justify-center gap-2"
        >
          <svg
            aria-hidden
            className="w-5 h-5 shrink-0"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          {exportandoRecibo ? "Generando…" : "Compartir"}
        </button>
        <button
          type="button"
          onClick={onDescargar}
          disabled={exportandoRecibo}
          className="flex-1 min-h-[50px] rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-100 font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform touch-manipulation flex items-center justify-center gap-2"
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

      {recibo.tipo === "recuperada" && onConfirmarRecuperada ? (
        <button
          type="button"
          onClick={onConfirmarRecuperada}
          disabled={confirmandoRecuperada}
          className="w-full min-h-[50px] rounded-xl bg-blue-700 text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform touch-manipulation shadow-lg shadow-blue-900/30"
        >
          {confirmandoRecuperada
            ? "Confirmando…"
            : "Confirmar y marcar como recuperada"}
        </button>
      ) : null}
    </div>
  );
}
