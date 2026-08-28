"use client";

import {
  CheckIcon,
  ClipboardListIcon,
  MapPinOffIcon,
  PhoneIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  gestionReciente,
  type MorosoBandeja,
} from "@/lib/carteraMorososTypes";
import type { CarteraPerfilId } from "@/lib/carteraPerfiles";
import { normalizarDiasMora } from "@/lib/extractoCliente";
import { formatearCOP } from "@/lib/formatoDinero";
import {
  enlaceMapsMoroso,
  enlaceTelMoroso,
  enlaceWhatsAppMoroso,
} from "@/lib/morososAcciones";
import { cn } from "@/lib/utils";

function IconoWhatsApp({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="currentColor"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function MorosoFila({
  moto,
  perfilId,
  seleccionada,
  onSeleccionar,
  onWhatsApp,
  onRegistrar,
  compactActions = false,
}: {
  moto: MorosoBandeja;
  perfilId: CarteraPerfilId | null;
  seleccionada?: boolean;
  onSeleccionar?: (moto: MorosoBandeja) => void;
  onWhatsApp: (moto: MorosoBandeja, url: string) => void;
  onRegistrar: (moto: MorosoBandeja) => void;
  compactActions?: boolean;
}) {
  const diasSinPagar = normalizarDiasMora(moto.dias_mora);
  const gestionadoHoy = gestionReciente(moto.gestiones, perfilId);
  const sinPerfil = !perfilId;
  const wa = enlaceWhatsAppMoroso(
    moto.telefono,
    moto.placa,
    moto.nombre,
    moto.deuda_total,
  );
  const tel = enlaceTelMoroso(moto.telefono);
  const sinUbicacion = moto.lat == null || moto.lng == null;
  const maps =
    moto.lat != null && moto.lng != null
      ? enlaceMapsMoroso(moto.lat, moto.lng)
      : null;

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
        className="flex w-full min-h-[44px] flex-col gap-1 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-pressed={seleccionada}
        onClick={() => onSeleccionar?.(moto)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold tracking-[0.1em] text-foreground">
                {moto.placa}
              </p>
              {gestionadoHoy ? (
                <span
                  className="inline-flex h-5 items-center gap-0.5 rounded-full bg-success px-1.5 text-success-foreground"
                  title="Gestionado hoy"
                >
                  <CheckIcon className="size-3" aria-hidden strokeWidth={3} />
                </span>
              ) : null}
              {sinUbicacion ? (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                  title="Sin ubicación GPS"
                >
                  <MapPinOffIcon className="size-3" aria-hidden />
                </span>
              ) : null}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {moto.nombre || "Sin nombre"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-bold tabular-nums text-destructive">
              {formatearCOP(moto.deuda_total)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {diasSinPagar}d sin pagar
            </p>
          </div>
        </div>
      </button>

      <div
        className={cn(
          "flex gap-2 border-t border-border/60 px-2 py-2",
          compactActions ? "flex-wrap" : "",
        )}
      >
        {wa ? (
          <Button
            type="button"
            className={cn(
              "h-11 min-h-[44px] rounded-lg bg-[#25D366] text-white hover:bg-[#1ebe57]",
              compactActions ? "min-w-[7rem] flex-1" : "flex-1",
            )}
            disabled={sinPerfil}
            aria-label={`WhatsApp ${moto.placa}`}
            onClick={() => {
              if (sinPerfil) return;
              onWhatsApp(moto, wa);
            }}
          >
            <IconoWhatsApp className="mr-1.5 size-4" />
            WhatsApp
          </Button>
        ) : null}
        {tel ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 min-h-[44px] min-w-[44px] rounded-lg px-3"
            aria-label={`Llamar ${moto.placa}`}
            asChild
          >
            <a href={tel}>
              <PhoneIcon className="size-4" aria-hidden />
              {!compactActions ? (
                <span className="ml-1.5 hidden sm:inline">Llamar</span>
              ) : null}
            </a>
          </Button>
        ) : null}
        {maps ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 min-h-[44px] rounded-lg px-3"
            aria-label={`Abrir en Maps ${moto.placa}`}
            asChild
          >
            <a href={maps} target="_blank" rel="noopener noreferrer">
              Maps
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="h-11 min-h-[44px] min-w-[44px] rounded-lg"
          disabled={sinPerfil}
          aria-label={`Registrar resultado ${moto.placa}`}
          onClick={() => {
            if (sinPerfil) return;
            onRegistrar(moto);
          }}
        >
          <ClipboardListIcon className="size-4" aria-hidden />
          {!compactActions ? (
            <span className="ml-1.5 hidden sm:inline">Registrar</span>
          ) : null}
        </Button>
      </div>
    </article>
  );
}
