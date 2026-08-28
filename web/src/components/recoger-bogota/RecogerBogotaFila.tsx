"use client";

import {
  CopyIcon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  Share2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EstadoGpsPlaca } from "@/lib/gpsEstadoPlacas";
import { formatearCOP } from "@/lib/formatoDinero";
import { cn } from "@/lib/utils";

export type FilaRecogerBogota = {
  placa: string;
  nombre: string;
  telefono: string;
  deuda_total: number;
  distancia_km: number | null;
  lat: number | null;
  lng: number | null;
  gps: EstadoGpsPlaca;
  pago_hoy: boolean;
};

function formatearDistancia(km: number | null): string {
  if (km == null) return "Sin GPS";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function RecogerBogotaFila({
  moto,
  indice,
  seleccionada,
  onSeleccionar,
  onCopiarAviso,
  avisoCopiado,
  onCompartirSeguimiento,
  linkCopiado,
  enlaceSeguir,
  enlaceMaps,
  enlaceTel,
  modo,
  modoRuta,
  enRuta,
  onToggleRuta,
}: {
  moto: FilaRecogerBogota;
  indice: number;
  seleccionada: boolean;
  onSeleccionar: () => void;
  onCopiarAviso: () => void;
  avisoCopiado: boolean;
  onCompartirSeguimiento: () => void;
  linkCopiado: boolean;
  enlaceSeguir: string;
  enlaceMaps: string | null;
  enlaceTel: string | null;
  modo: "recoger" | "llamar";
  modoRuta?: boolean;
  enRuta?: boolean;
  onToggleRuta?: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border bg-card transition-colors",
        seleccionada
          ? "border-primary ring-2 ring-primary/30"
          : "border-border/80",
      )}
    >
      <button
        type="button"
        className="flex w-full flex-col gap-1 rounded-xl px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-pressed={seleccionada}
        onClick={onSeleccionar}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {modoRuta && onToggleRuta ? (
                <input
                  type="checkbox"
                  checked={enRuta}
                  aria-label={`Incluir ${moto.placa} en la ruta`}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggleRuta()}
                  className="size-5 shrink-0 rounded border-border accent-primary"
                />
              ) : (
                <span className="text-xs font-bold tabular-nums text-muted-foreground">
                  {indice}
                </span>
              )}
              <p className="text-base font-bold tracking-[0.12em] text-foreground">
                {moto.placa}
              </p>
              {moto.pago_hoy ? (
                <Badge variant="secondary" className="bg-success/15 text-success">
                  Pagó hoy
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {moto.nombre || "Sin nombre"}
            </p>
            {modo === "llamar" && moto.telefono ? (
              <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
                {moto.telefono}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold tabular-nums text-destructive">
              {formatearCOP(moto.deuda_total)}
            </p>
            {modo === "recoger" ? (
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatearDistancia(moto.distancia_km)}
              </p>
            ) : null}
          </div>
        </div>
        {modo === "recoger" ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge
              variant="secondary"
              className={
                moto.gps.funcional
                  ? "bg-success/15 text-success"
                  : "text-muted-foreground"
              }
            >
              {moto.gps.funcional
                ? `GPS ${moto.gps.estado_etiqueta}`
                : moto.gps.estado_etiqueta || "Sin GPS"}
            </Badge>
          </div>
        ) : null}
      </button>

      <div className="flex flex-wrap gap-2 border-t border-border/60 px-2 py-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 min-h-[44px] flex-1 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20"
          onClick={onCopiarAviso}
        >
          <CopyIcon className="mr-1.5 size-4" aria-hidden />
          {avisoCopiado ? "Copiado" : "Copiar aviso"}
        </Button>
        {enlaceTel ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 min-h-[44px] min-w-[44px] rounded-lg"
            aria-label={`Llamar ${moto.placa}`}
            asChild
          >
            <a href={enlaceTel}>
              <PhoneIcon className="size-4" aria-hidden />
            </a>
          </Button>
        ) : null}
        {modo === "recoger" && enlaceMaps ? (
          <>
            <Button
              type="button"
              variant="secondary"
              className="h-11 min-h-[44px] flex-1 rounded-lg"
              asChild
            >
              <a href={enlaceMaps} target="_blank" rel="noopener noreferrer">
                <NavigationIcon className="mr-1.5 size-4" aria-hidden />
                Ir en Maps
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-[44px] min-w-[44px] rounded-lg"
              aria-label={`Compartir seguimiento ${moto.placa}`}
              onClick={onCompartirSeguimiento}
            >
              <Share2Icon className="size-4" aria-hidden />
              <span className="sr-only">
                {linkCopiado ? "Link copiado" : "Compartir seguimiento"}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 min-h-[44px] w-full rounded-lg text-sm"
              asChild
            >
              <a href={enlaceSeguir} target="_blank" rel="noopener noreferrer">
                <MapPinIcon className="mr-1.5 size-4" aria-hidden />
                Ver en vivo
              </a>
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}
