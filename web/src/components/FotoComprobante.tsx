"use client";

import { useEffect, useState } from "react";

import { resolverSrcFotoComprobante } from "@/lib/fotoComprobante";

type Props = {
  placa: string;
  fotoRemota?: string | null;
  /** Si ya tienes data URL local (recibo recién generado), úsala sin ir a Supabase. */
  fotoLocal?: string | null;
  className?: string;
  alt?: string;
};

export function FotoComprobante({
  placa,
  fotoRemota,
  fotoLocal,
  className = "w-full rounded-xl border border-zinc-700 object-cover max-h-44 bg-zinc-800",
  alt,
}: Props) {
  const [src, setSrc] = useState<string | null>(fotoLocal ?? null);

  useEffect(() => {
    if (fotoLocal) {
      setSrc(fotoLocal);
      return;
    }
    if (!fotoRemota) {
      setSrc(null);
      return;
    }

    let cancelado = false;
    void resolverSrcFotoComprobante(placa, fotoRemota).then((url) => {
      if (!cancelado) setSrc(url);
    });
    return () => {
      cancelado = true;
    };
  }, [placa, fotoRemota, fotoLocal]);

  if (!src && !fotoRemota) return null;

  const altText = alt ?? `Comprobante de pago placa ${placa}`;

  if (!src) {
    return (
      <div
        className={`${className} flex items-center justify-center min-h-[80px] text-xs text-zinc-500`}
      >
        Cargando foto…
      </div>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="block touch-manipulation"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={altText}
        className={className}
        loading="lazy"
        data-placa={placa}
      />
    </a>
  );
}
