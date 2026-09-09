"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

function partesRestantes(endsAtMs: number, ahora: number) {
  const ms = Math.max(0, endsAtMs - ahora);
  const totalSec = Math.floor(ms / 1000);
  const dias = Math.floor(totalSec / 86_400);
  const horas = Math.floor((totalSec % 86_400) / 3600);
  const minutos = Math.floor((totalSec % 3600) / 60);
  const segundos = totalSec % 60;
  return { dias, horas, minutos, segundos, ms };
}

export function Lote17Contador({
  endsAt,
  vencido = false,
}: {
  endsAt: string;
  vencido?: boolean;
}) {
  const liveId = useId();
  const endsAtMs = new Date(endsAt).getTime();
  const [ahora, setAhora] = useState(() => Date.now());
  const [anuncio, setAnuncio] = useState("");
  const anuncioListo = useRef(false);

  useEffect(() => {
    if (vencido || Number.isNaN(endsAtMs)) return;
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAtMs, vencido]);

  useEffect(() => {
    if (vencido || Number.isNaN(endsAtMs)) {
      setAnuncio("Plazo terminado");
      return;
    }
    const p = partesRestantes(endsAtMs, ahora);
    if (!anuncioListo.current || p.segundos === 0) {
      anuncioListo.current = true;
      setAnuncio(
        `Quedan ${p.dias} días, ${p.horas} horas y ${p.minutos} minutos`,
      );
    }
  }, [ahora, endsAtMs, vencido]);

  const p = partesRestantes(endsAtMs, ahora);
  const agotado = vencido || p.ms <= 0;

  const celdas = [
    { label: "Días", value: p.dias },
    { label: "Horas", value: p.horas },
    { label: "Min", value: p.minutos },
    { label: "Seg", value: p.segundos },
  ];

  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-3",
        agotado
          ? "border-destructive/50 bg-destructive/10"
          : "border-border bg-card",
      )}
    >
      <p className="text-sm font-medium text-foreground">
        {agotado ? "Se acabó el tiempo" : "Tiempo para terminar tu lista"}
      </p>
      <div
        className="mt-2 grid grid-cols-4 gap-2"
        aria-hidden={true}
      >
        {celdas.map((c) => (
          <div
            key={c.label}
            className="flex flex-col items-center rounded-xl bg-background/80 px-1 py-2"
          >
            <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
              {String(c.value).padStart(2, "0")}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {c.label}
            </span>
          </div>
        ))}
      </div>
      <p id={liveId} className="sr-only" aria-live="polite" aria-atomic="true">
        {anuncio}
      </p>
    </div>
  );
}
