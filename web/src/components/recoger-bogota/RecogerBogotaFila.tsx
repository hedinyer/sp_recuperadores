"use client";

import { useId, useState } from "react";
import {
  CopyIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  NavigationIcon,
  PhoneIcon,
  Share2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EstadoGpsPlaca } from "@/lib/gpsEstadoPlacas";
import { formatearCOP } from "@/lib/formatoDinero";
import type { FuenteUbicacion } from "@/lib/ubicacionFusion";
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
  fuentes: { gps: boolean; airtag: boolean };
  fuente_preferida?: FuenteUbicacion | null;
  fuente_activa: FuenteUbicacion | null;
  airtag: {
    visto_en: string | null;
    accuracy_m: number | null;
  } | null;
};

function formatearDistancia(km: number | null): string {
  if (km == null) return "Sin ubicación";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function formatearVistoHace(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const diff = Date.now() - ms;
  if (diff < 0) return null;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
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
  compacta,
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
  /** Móvil: solo placa + plata + distancia; acciones van en la barra fija. */
  compacta?: boolean;
}) {
  const [masAbierto, setMasAbierto] = useState(false);
  const masPanelId = useId();
  const tieneUbicacion = moto.lat != null && moto.lng != null;
  const vistoAirTag = formatearVistoHace(moto.airtag?.visto_en);
  const preferida = moto.fuente_preferida ?? moto.fuente_activa;
  const etiquetaGps = moto.gps.proveedor_etiqueta
    ? `GPS ${moto.gps.proveedor_etiqueta}`
    : "GPS";
  const estadoGps =
    moto.gps.funcional
      ? moto.gps.estado_etiqueta || "En línea"
      : moto.fuentes.gps
        ? "última posición"
        : moto.gps.estado_etiqueta || "Sin señal";

  return (
    <article
      data-placa={moto.placa}
      className={cn(
        "rounded-xl border bg-card transition-colors",
        seleccionada
          ? "border-primary ring-2 ring-primary/30"
          : "border-border/80",
      )}
    >
      <div className="flex items-stretch gap-0">
        {modoRuta && onToggleRuta ? (
          <div className="flex shrink-0 items-center border-r border-border/60 px-2.5">
            <input
              type="checkbox"
              checked={enRuta}
              aria-label={`Incluir ${moto.placa} en la ruta`}
              onChange={() => onToggleRuta()}
              className="size-5 shrink-0 rounded border-border accent-primary"
            />
          </div>
        ) : null}

        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          aria-pressed={seleccionada}
          onClick={onSeleccionar}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {!modoRuta ? (
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">
                    {indice}
                  </span>
                ) : null}
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
                <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
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
                  a {formatearDistancia(moto.distancia_km)}
                </p>
              ) : null}
            </div>
          </div>
          {modo === "recoger" && !compacta ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {preferida === "gps" || (moto.fuentes.gps && preferida !== "airtag") ? (
                <Badge
                  variant="secondary"
                  className={
                    preferida === "gps"
                      ? moto.gps.funcional
                        ? "bg-success/15 text-success"
                        : "bg-success/10 text-success"
                      : "text-muted-foreground"
                  }
                >
                  {preferida === "gps" ? "● " : ""}
                  {etiquetaGps}
                  {preferida === "gps" ? ` · ${estadoGps}` : ""}
                </Badge>
              ) : null}
              {preferida === "airtag" && vistoAirTag ? (
                <Badge
                  variant="secondary"
                  className="bg-sky-500/15 text-sky-700 dark:text-sky-300"
                >
                  ● Visto {vistoAirTag}
                </Badge>
              ) : null}
              {preferida === "airtag" && !vistoAirTag && tieneUbicacion ? (
                <Badge
                  variant="secondary"
                  className="bg-sky-500/15 text-sky-700 dark:text-sky-300"
                >
                  ● Ubicación
                </Badge>
              ) : null}
              {!tieneUbicacion && !moto.fuentes.gps && !moto.fuentes.airtag ? (
                <Badge variant="secondary" className="text-muted-foreground">
                  Sin ubicación
                </Badge>
              ) : null}
            </div>
          ) : null}
        </button>
      </div>

      {/* Acciones: en compacta (móvil recoger) se omiten; en llamar o desktop se muestran */}
      {!compacta || modo === "llamar" ? (
        <div className="flex flex-wrap gap-2 border-t border-border/60 px-2 py-2">
          {modo === "llamar" ? (
            <>
              {enlaceTel ? (
                <Button
                  type="button"
                  className="h-11 min-h-[44px] flex-1 rounded-lg text-base font-semibold"
                  asChild
                >
                  <a href={enlaceTel}>
                    <PhoneIcon className="mr-1.5 size-4" aria-hidden />
                    Llamar
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-11 min-h-[44px] flex-1 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20"
                onClick={onCopiarAviso}
              >
                <CopyIcon className="mr-1.5 size-4" aria-hidden />
                {avisoCopiado ? "Copiado" : "Copiar aviso"}
              </Button>
            </>
          ) : (
            <>
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
              {tieneUbicacion ? (
                <>
                  {enlaceMaps ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-11 min-h-[44px] flex-1 rounded-lg"
                      asChild
                    >
                      <a href={enlaceMaps} target="_blank" rel="noopener noreferrer">
                        <NavigationIcon className="mr-1.5 size-4" aria-hidden />
                        Ir
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 min-h-[44px] flex-1 rounded-lg"
                    aria-label={`Compartir seguimiento ${moto.placa}`}
                    onClick={onCompartirSeguimiento}
                  >
                    <Share2Icon className="mr-1.5 size-4" aria-hidden />
                    {linkCopiado ? "Link copiado" : "Compartir"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 min-h-[44px] min-w-[44px] rounded-lg"
                    aria-expanded={masAbierto}
                    aria-controls={masPanelId}
                    aria-label={`Más acciones ${moto.placa}`}
                    onClick={() => setMasAbierto((v) => !v)}
                  >
                    <MoreHorizontalIcon className="size-4" aria-hidden />
                  </Button>
                  {masAbierto ? (
                    <div id={masPanelId} className="flex w-full flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 min-h-[44px] flex-1 rounded-lg text-sm"
                        asChild
                      >
                        <a href={enlaceSeguir} target="_blank" rel="noopener noreferrer">
                          <MapPinIcon className="mr-1.5 size-4" aria-hidden />
                          Ver en vivo
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}
