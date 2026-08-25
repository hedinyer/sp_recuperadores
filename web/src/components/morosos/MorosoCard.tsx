"use client";

import { CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  gestionReciente,
  type GestionCartera,
  type MorosoBandeja,
} from "@/lib/carteraMorososTypes";
import type { CarteraPerfilId } from "@/lib/carteraPerfiles";
import { etiquetaCarteraStatus } from "@/lib/carteraPerfiles";
import { diasDesde, formatFechaHora } from "@/lib/fechas";
import { formatearCOP } from "@/lib/formatoDinero";
import { montoDesdeGestion } from "@/lib/carteraKpis";
import { cn } from "@/lib/utils";

function etiquetaEstadoConMonto(g: {
  status: string;
  notas?: string | null;
  monto?: number | null;
}): string {
  const base = etiquetaCarteraStatus(g.status);
  const monto = montoDesdeGestion(g);
  return monto > 0 ? `${base} · ${formatearCOP(monto)}` : base;
}

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

export function MorosoCard({
  moto,
  perfilId,
  onWhatsApp,
  onRegistrar,
  onHistorial,
}: {
  moto: MorosoBandeja;
  perfilId: CarteraPerfilId | null;
  onWhatsApp: (moto: MorosoBandeja, url: string) => void;
  onRegistrar: (moto: MorosoBandeja) => void;
  onHistorial: (moto: MorosoBandeja) => void;
}) {
  const waTexto = `Hola ${moto.nombre.split(" ")[0] || ""}, te escribimos por el atraso de la moto ${moto.placa}. Deuda aproximada: ${formatearCOP(moto.deuda_total)}.`;
  const wa = enlaceWhatsApp(moto.telefono, waTexto);
  const conChulito = gestionReciente(moto.gestiones, perfilId);
  const ultimo = (moto.gestiones ?? [])[0] as GestionCartera | undefined;
  const diasMoto = diasDesde(moto.fecha_inicio);
  const sinPerfil = !perfilId;

  return (
    <Card className="gap-0 rounded-2xl border-border/80 bg-card py-0 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-2 px-3.5 pt-3.5 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold tracking-[0.12em] text-foreground">
              {moto.placa}
            </p>
            {conChulito ? (
              <span
                className="inline-flex size-6 items-center justify-center rounded-full bg-success text-success-foreground"
                title="Tú la gestionaste hoy"
                aria-label="Tú la gestionaste hoy"
              >
                <CheckIcon className="size-3.5" aria-hidden strokeWidth={3} />
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground/90">
            {moto.nombre || "Sin nombre"}
          </p>
          {moto.telefono ? (
            <a
              href={`tel:${moto.telefono.replace(/\s/g, "")}`}
              className="mt-0.5 block text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              {moto.telefono}
            </a>
          ) : null}
        </div>
        <Badge
          variant="secondary"
          className={cn(
            "shrink-0",
            moto.gps.funcional
              ? "bg-success/15 text-success"
              : "text-muted-foreground",
          )}
        >
          {moto.gps.funcional
            ? "GPS activo"
            : moto.gps.estado_etiqueta || "Sin GPS"}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-3.5 pb-3">
        {ultimo ? (
          <p className="text-sm text-foreground">
            <span className="font-medium">{etiquetaEstadoConMonto(ultimo)}</span>
            {ultimo.created_at ? (
              <span className="tabular-nums text-muted-foreground">
                {" · "}
                {formatFechaHora(ultimo.created_at)}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Aún no la gestionaste</p>
        )}

        {(moto.gestiones?.length ?? 0) > 0 ? (
          <p className="text-xs text-muted-foreground">
            Tras {moto.gestiones!.length} gestión
            {moto.gestiones!.length === 1 ? "" : "es"} en este caso
            {" · "}
            <a
              href={`/efectividad?placa=${encodeURIComponent(moto.placa)}`}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Ver efectividad
            </a>
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Debe</p>
            <p className="text-sm font-semibold tabular-nums text-destructive">
              {formatearCOP(moto.deuda_total)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Días sin pagar</p>
            <p className="text-sm font-semibold tabular-nums">
              {moto.dias_mora}d
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Con moto</p>
            <p className="text-sm font-semibold tabular-nums">
              {diasMoto != null ? `${diasMoto}d` : "—"}
            </p>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 px-3.5 pb-3.5 pt-0">
        {wa ? (
          <Button
            type="button"
            className="h-11 w-full rounded-lg bg-[#25D366] text-white hover:bg-[#1ebe57] active:scale-[0.96]"
            disabled={sinPerfil}
            aria-disabled={sinPerfil}
            title={sinPerfil ? "Elige quién eres arriba" : undefined}
            onClick={() => {
              if (sinPerfil) return;
              onWhatsApp(moto, wa);
            }}
          >
            WhatsApp
          </Button>
        ) : (
          <p className="w-full text-center text-xs text-muted-foreground">
            Sin teléfono para WhatsApp
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-lg active:scale-[0.96]"
          disabled={sinPerfil}
          aria-disabled={sinPerfil}
          title={sinPerfil ? "Elige quién eres arriba" : undefined}
          onClick={() => {
            if (sinPerfil) return;
            onRegistrar(moto);
          }}
        >
          Registrar resultado
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto px-0 text-sm text-muted-foreground"
          onClick={() => onHistorial(moto)}
        >
          Ver historial
        </Button>
      </CardFooter>
    </Card>
  );
}
