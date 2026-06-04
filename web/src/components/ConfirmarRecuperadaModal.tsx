"use client";

import { etiquetaRecuperador } from "@/lib/recuperadores";

type Props = {
  placa: string;
  recuperador: string;
  solicitandoGps: boolean;
  onCancelar: () => void;
  onContinuar: () => void;
};

export function ConfirmarRecuperadaModal({
  placa,
  recuperador,
  solicitandoGps,
  onCancelar,
  onContinuar,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-[400px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <p className="text-[11px] text-blue-400 font-medium mb-1">
          Paso 1 de 2
        </p>
        <h2 className="text-base font-semibold text-white mb-2">
          ¿Recuperaste la moto?
        </h2>
        <p className="text-sm text-zinc-400 mb-1">
          Placa{" "}
          <span className="text-white font-bold tracking-widest">{placa}</span>
        </p>
        <p className="text-sm text-zinc-500 mb-5">
          Recuperador: {etiquetaRecuperador(recuperador)}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm touch-manipulation"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onContinuar}
            disabled={solicitandoGps}
            className="flex-1 min-h-[48px] rounded-xl bg-blue-700 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
          >
            {solicitandoGps ? "Obteniendo GPS…" : "Sí, continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}
