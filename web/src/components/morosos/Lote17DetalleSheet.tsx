"use client";

import { PhoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Lote17Item } from "@/lib/carteraLotes17Types";
import { formatearCOP } from "@/lib/formatoDinero";

function telHref(telefono: string): string | null {
  const digits = telefono.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `tel:+${digits.startsWith("57") ? digits : `57${digits}`}`;
}

function RefRow({
  titulo,
  nombre,
  telefono,
}: {
  titulo: string;
  nombre?: string;
  telefono?: string;
}) {
  const nom = (nombre ?? "").trim();
  const tel = (telefono ?? "").trim();
  if (!nom && !tel) return null;
  const href = telHref(tel);

  return (
    <div className="rounded-xl border border-border px-3 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-1 text-base font-medium text-foreground">
        {nom || "Sin nombre"}
      </p>
      {tel ? (
        <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{tel}</p>
      ) : (
        <p className="mt-0.5 text-sm text-muted-foreground">Sin teléfono</p>
      )}
      {href ? (
        <Button asChild className="mt-3 h-11 w-full rounded-xl text-base">
          <a href={href}>
            <PhoneIcon className="size-4" aria-hidden />
            Llamar a {titulo.toLowerCase()}
          </a>
        </Button>
      ) : null}
    </div>
  );
}

export function Lote17DetalleSheet({
  open,
  onOpenChange,
  item,
  onAnotar,
  onHistorial,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Lote17Item | null;
  onAnotar: (item: Lote17Item) => void;
  onHistorial: (item: Lote17Item) => void;
  disabled?: boolean;
}) {
  const telCliente = item ? telHref(item.telefono) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="tracking-[0.12em]">
            {item?.placa ?? "Detalle"}
          </SheetTitle>
          <SheetDescription>
            {item
              ? `${item.nombre || "Sin nombre"} · Debe ${formatearCOP(item.deuda_total)}`
              : "Datos del cliente"}
          </SheetDescription>
        </SheetHeader>

        {item ? (
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="rounded-xl bg-muted/50 px-3 py-3 text-sm">
              <p>
                <span className="text-muted-foreground">Cédula: </span>
                <span className="tabular-nums">{item.cedula || "—"}</span>
              </p>
              <p className="mt-1">
                <span className="text-muted-foreground">Cuotas: </span>
                <span className="tabular-nums">
                  {item.cuotas_pendientes || "—"}
                </span>
              </p>
              <p className="mt-1">
                <span className="text-muted-foreground">Teléfono: </span>
                <span className="tabular-nums">{item.telefono || "—"}</span>
              </p>
            </div>

            {telCliente ? (
              <Button asChild className="h-12 rounded-xl text-base">
                <a href={telCliente}>
                  <PhoneIcon className="size-4" aria-hidden />
                  Llamar al cliente
                </a>
              </Button>
            ) : null}

            <p className="text-sm font-medium text-foreground">Referencias</p>
            <RefRow
              titulo="Referencia 1"
              nombre={item.referencia_1}
              telefono={item.telefono_ref_1}
            />
            <RefRow
              titulo="Referencia 2"
              nombre={item.referencia_2}
              telefono={item.telefono_ref_2}
            />
            {!item.referencia_1?.trim() &&
            !item.telefono_ref_1?.trim() &&
            !item.referencia_2?.trim() &&
            !item.telefono_ref_2?.trim() ? (
              <p className="text-sm text-muted-foreground">
                Este cliente no tiene referencias guardadas.
              </p>
            ) : null}

            {item.ultima_gestion_texto ? (
              <div className="rounded-xl border border-border px-3 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Última gestión
                </p>
                <p className="mt-1 text-sm text-pretty text-foreground">
                  {item.gestion_ayer ? "Ayer: " : ""}
                  {item.ultima_gestion_texto}
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl"
                onClick={() => onHistorial(item)}
              >
                Historial
              </Button>
              <Button
                type="button"
                className="h-12 rounded-xl text-base"
                disabled={disabled}
                onClick={() => {
                  onOpenChange(false);
                  onAnotar(item);
                }}
              >
                Anotar
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
