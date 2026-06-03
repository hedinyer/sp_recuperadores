"use client";

import { useEffect, useState } from "react";

import { fotoRecuperadorUrl } from "@/lib/recuperadores";

type Props = {
  etiqueta: string;
  foto: string;
  pendientes: number;
  activo: boolean;
  onClick: () => void;
};

export function RecuperadorFifaCard({
  etiqueta,
  foto,
  pendientes,
  activo,
  onClick,
}: Props) {
  const [imgOk, setImgOk] = useState(true);
  const inicial = etiqueta.charAt(0).toUpperCase();
  const tieneFoto = Boolean(foto && imgOk);

  useEffect(() => {
    setImgOk(true);
  }, [foto]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      aria-label={`${etiqueta}${pendientes > 0 ? `, ${pendientes} pendientes` : ""}`}
      className={`relative w-full aspect-[3/4] rounded-xl overflow-hidden touch-manipulation transition-all duration-200 ${
        activo
          ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-zinc-950 scale-[1.02] shadow-lg shadow-amber-500/25 z-[1]"
          : "ring-1 ring-zinc-700/80 active:scale-[0.97]"
      }`}
    >
      {/* Fondo estilo carta FIFA */}
      <div
        className={`absolute inset-0 ${
          activo
            ? "bg-gradient-to-b from-amber-500/35 via-amber-950/50 to-zinc-950"
            : "bg-gradient-to-b from-zinc-600/25 via-zinc-900 to-zinc-950"
        }`}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            "linear-gradient(135deg, transparent 40%, rgba(251,191,36,0.15) 50%, transparent 60%)",
        }}
      />
      {/* Rating = motos pendientes */}
      {pendientes > 0 ? (
        <span className="absolute top-1.5 left-1.5 z-10 min-w-[22px] h-[22px] px-1 flex items-center justify-center rounded-md bg-amber-400 text-[11px] font-black text-zinc-950 tabular-nums shadow-md">
          {pendientes}
        </span>
      ) : null}

      {/* Foto o inicial */}
      {tieneFoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fotoRecuperadorUrl(foto)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]"
          onError={() => setImgOk(false)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-5xl font-black leading-none select-none ${
              activo ? "text-amber-200/40" : "text-zinc-600/50"
            }`}
            aria-hidden
          >
            {inicial}
          </span>
        </div>
      )}

      {/* Franja nombre */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/95 to-black/70 px-1 py-1.5 border-t border-amber-500/30">
        <p
          className={`text-[10px] font-bold text-center uppercase tracking-wide leading-tight truncate ${
            activo ? "text-amber-100" : "text-zinc-200"
          }`}
        >
          {etiqueta}
        </p>
      </div>
    </button>
  );
}
