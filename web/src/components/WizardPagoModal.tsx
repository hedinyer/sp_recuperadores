"use client";

import type { ChangeEvent, RefObject } from "react";

import { formatearConPuntos, limpiarNumero } from "@/lib/formatoDinero";
import type { MetodoPago, PagoPaso } from "@/lib/reciboTypes";
import { METODOS_PAGO } from "@/lib/reciboTypes";

type Props = {
  pagoPaso: PagoPaso;
  esPresencial: boolean | null;
  montoPago: string;
  montoMulta: string;
  metodoPago: MetodoPago | "";
  fotoPreview: string | null;
  fotoFile: File | null;
  procesandoFoto: boolean;
  gpsCapturado: string | null;
  solicitandoGps: boolean;
  guardandoPago: boolean;
  inputFotoRef: RefObject<HTMLInputElement | null>;
  onMontoPagoChange: (v: string) => void;
  onMontoMultaChange: (v: string) => void;
  onMetodoPagoChange: (m: MetodoPago) => void;
  onSeleccionarFoto: (e: ChangeEvent<HTMLInputElement>) => void;
  onCerrar: () => void;
  onPasoChange: (paso: PagoPaso) => void;
  onAvanzarModalidad: () => void;
  onElegirPresencial: () => void;
  onGenerarRemoto: () => void;
  onCapturarGps: () => void;
  onGenerarRecibo: () => void;
  onLimpiarFoto: () => void;
};

export function WizardPagoModal({
  pagoPaso,
  esPresencial,
  montoPago,
  montoMulta,
  metodoPago,
  fotoPreview,
  fotoFile,
  procesandoFoto,
  gpsCapturado,
  solicitandoGps,
  guardandoPago,
  inputFotoRef,
  onMontoPagoChange,
  onMontoMultaChange,
  onMetodoPagoChange,
  onSeleccionarFoto,
  onCerrar,
  onPasoChange,
  onAvanzarModalidad,
  onElegirPresencial,
  onGenerarRemoto,
  onCapturarGps,
  onGenerarRecibo,
  onLimpiarFoto,
}: Props) {
  const totalPasosPago = esPresencial === true ? 4 : 3;
  const indicePasoPago =
    pagoPaso === "montos"
      ? 1
      : pagoPaso === "metodo"
        ? 2
        : pagoPaso === "modalidad"
          ? 3
          : pagoPaso === "foto"
            ? 4
            : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-[400px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <p className="text-[11px] text-emerald-400 font-medium mb-1">
          Paso {indicePasoPago} de {totalPasosPago}
        </p>

        {pagoPaso === "montos" && (
          <>
            <h2 className="text-base font-semibold text-white mb-1">
              ¿Cuánto pagó el cliente?
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Escribe el abono y la multa si aplica.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 pl-0.5 block mb-1">
                  Valor del abono ($)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formatearConPuntos(montoPago)}
                  onChange={(e) =>
                    onMontoPagoChange(limpiarNumero(e.target.value))
                  }
                  className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 pl-0.5 block mb-1">
                  Valor de la multa ($)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={formatearConPuntos(montoMulta)}
                  onChange={(e) =>
                    onMontoMultaChange(limpiarNumero(e.target.value))
                  }
                  className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={onCerrar}
                className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm touch-manipulation"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => onPasoChange("metodo")}
                disabled={!limpiarNumero(montoPago)}
                className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
              >
                Siguiente
              </button>
            </div>
          </>
        )}

        {pagoPaso === "metodo" && (
          <>
            <h2 className="text-base font-semibold text-white mb-1">
              ¿Cómo pagó?
            </h2>
            <p className="text-xs text-zinc-500 mb-4">Elige una opción.</p>
            <div className="flex flex-col gap-2">
              {METODOS_PAGO.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onMetodoPagoChange(m)}
                  className={`min-h-[52px] rounded-xl border text-base font-semibold touch-manipulation ${
                    metodoPago === m
                      ? "border-emerald-500 bg-emerald-950/50 text-emerald-200"
                      : "border-zinc-600 bg-zinc-800 text-white"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => onPasoChange("montos")}
                className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm touch-manipulation"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={onAvanzarModalidad}
                disabled={!metodoPago || solicitandoGps}
                className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
              >
                {solicitandoGps ? "GPS…" : "Siguiente"}
              </button>
            </div>
          </>
        )}

        {pagoPaso === "modalidad" && (
          <>
            <h2 className="text-base font-semibold text-white mb-1">
              ¿El pago fue en persona?
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Presencial = estás con el cliente. Remoto = transferencia o Nequi
              sin estar juntos.
            </p>
            {metodoPago === "Efectivo" && gpsCapturado ? (
              <p className="text-xs text-emerald-400 mb-3 tabular-nums">
                ✓ Ubicación GPS: {gpsCapturado}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onElegirPresencial}
                disabled={solicitandoGps || guardandoPago}
                className={`min-h-[52px] rounded-xl border text-base font-semibold touch-manipulation disabled:opacity-60 ${
                  esPresencial === true
                    ? "border-emerald-500 bg-emerald-950/50 text-emerald-200"
                    : "border-zinc-600 bg-zinc-800 text-white"
                }`}
              >
                {solicitandoGps ? "Activando GPS…" : "Sí, presencial"}
              </button>
              <button
                type="button"
                onClick={onGenerarRemoto}
                disabled={
                  guardandoPago ||
                  (metodoPago === "Efectivo" && !gpsCapturado)
                }
                className="min-h-[52px] rounded-xl border border-zinc-600 bg-zinc-800 text-base font-semibold text-white disabled:opacity-50 touch-manipulation"
              >
                No, remoto
              </button>
            </div>
            <button
              type="button"
              onClick={() => onPasoChange("metodo")}
              className="w-full mt-4 min-h-[44px] rounded-xl border border-zinc-700 text-zinc-400 text-sm touch-manipulation"
            >
              Atrás
            </button>
          </>
        )}

        {pagoPaso === "foto" && (
          <>
            <h2 className="text-base font-semibold text-white mb-1">
              Toma una foto del pago
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Fotografía el comprobante o al cliente entregando el dinero.
            </p>
            {gpsCapturado ? (
              <p className="text-xs text-emerald-400 mb-3 tabular-nums">
                ✓ Ubicación GPS guardada: {gpsCapturado}
              </p>
            ) : (
              <button
                type="button"
                onClick={onCapturarGps}
                disabled={solicitandoGps}
                className="w-full mb-3 min-h-[44px] rounded-xl border border-amber-700/60 bg-amber-950/30 text-amber-200 text-sm font-medium touch-manipulation"
              >
                {solicitandoGps
                  ? "Obteniendo GPS…"
                  : "Activar ubicación GPS"}
              </button>
            )}
            <input
              ref={inputFotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onSeleccionarFoto}
            />
            {procesandoFoto ? (
              <p className="w-full min-h-[120px] flex items-center justify-center text-sm text-zinc-400 mb-3">
                Comprimiendo foto…
              </p>
            ) : fotoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fotoPreview}
                alt="Vista previa"
                className="w-full rounded-xl border border-zinc-600 object-cover max-h-52 mb-3"
              />
            ) : (
              <button
                type="button"
                onClick={() => inputFotoRef.current?.click()}
                disabled={procesandoFoto}
                className="w-full min-h-[120px] rounded-xl border-2 border-dashed border-zinc-600 bg-zinc-800/50 text-zinc-300 text-sm font-medium touch-manipulation disabled:opacity-50"
              >
                Tocar para abrir cámara
              </button>
            )}
            {fotoPreview && (
              <button
                type="button"
                onClick={onLimpiarFoto}
                className="w-full mt-2 text-xs text-zinc-500 underline"
              >
                Tomar otra foto
              </button>
            )}
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => onPasoChange("modalidad")}
                disabled={guardandoPago}
                className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm touch-manipulation"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={onGenerarRecibo}
                disabled={
                  !fotoFile || guardandoPago || !gpsCapturado || procesandoFoto
                }
                className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
              >
                {guardandoPago ? "Guardando…" : "Generar recibo"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
