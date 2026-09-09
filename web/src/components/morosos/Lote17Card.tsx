"use client";

import { PhoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatearCOP } from "@/lib/formatoDinero";
import type { Lote17Item } from "@/lib/carteraLotes17Types";
import { mensajeCobranzaWhatsApp } from "@/lib/morososAcciones";
import { cn } from "@/lib/utils";

function enlaceWhatsApp(telefono: string, texto: string): string | null {
  const digits = telefono.replace(/\D/g, "");
  if (!digits) return null;
  const conPais = digits.startsWith("57")
    ? digits
    : digits.startsWith("0")
      ? `57${digits.slice(1)}`
      : `57${digits}`;
  return `https://wa.me/${conPais}?text=${encodeURIComponent(texto)}`;
}

function telHref(telefono: string): string | null {
  const digits = telefono.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `tel:+${digits.startsWith("57") ? digits : `57${digits}`}`;
}

export function Lote17Card({
  item,
  disabled,
  onWhatsApp,
  onAnotar,
  onDetalle,
}: {
  item: Lote17Item;
  disabled?: boolean;
  onWhatsApp: (item: Lote17Item, url: string) => void;
  onAnotar: (item: Lote17Item) => void;
  onDetalle: (item: Lote17Item) => void;
}) {
  const waTexto = mensajeCobranzaWhatsApp(
    item.nombre,
    item.placa,
    item.deuda_total,
  );
  const wa = enlaceWhatsApp(item.telefono, waTexto);
  const tel = telHref(item.telefono);
  const prefijoAyer = item.gestion_ayer ? "Ayer: " : "";

  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5",
        item.pago_hoy && "border-success/40 bg-success/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-[0.14em] text-foreground">
            {item.placa}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {item.nombre || "Sin nombre"}
          </p>
          <p className="mt-1 text-base font-semibold tabular-nums text-destructive">
            Debe {formatearCOP(item.deuda_total)}
          </p>
        </div>
        {item.pago_hoy ? (
          <span className="shrink-0 rounded-lg bg-success/15 px-2 py-1 text-xs font-semibold text-success">
            Pagó hoy
          </span>
        ) : null}
      </div>

      {item.ultima_gestion_texto ? (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-pretty text-foreground">
          <span className="font-medium">{prefijoAyer}</span>
          {item.ultima_gestion_texto}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Sin anotaciones aún</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {tel ? (
          <Button
            asChild
            variant="outline"
            className="h-12 rounded-xl text-base"
            disabled={disabled}
          >
            <a href={tel}>
              <PhoneIcon className="size-4" aria-hidden />
              Llamar
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl text-base"
            disabled
          >
            Sin teléfono
          </Button>
        )}
        {wa ? (
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl text-base"
            disabled={disabled}
            onClick={() => onWhatsApp(item, wa)}
          >
            WhatsApp
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl text-base"
            disabled
          >
            Sin WhatsApp
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-12 rounded-xl text-base"
          onClick={() => onDetalle(item)}
        >
          Ver datos
        </Button>
        <Button
          type="button"
          className="h-12 rounded-xl text-base font-semibold"
          disabled={disabled}
          onClick={() => onAnotar(item)}
        >
          Anotar
        </Button>
      </div>
    </article>
  );
}
