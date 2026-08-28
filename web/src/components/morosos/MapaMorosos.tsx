"use client";

import "leaflet/dist/leaflet.css";

import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatearCOP } from "@/lib/formatoDinero";
import { cn } from "@/lib/utils";

export type PuntoMorosoMapa = {
  placa: string;
  lat: number;
  lng: number;
  deuda_total: number;
  dias_mora: number;
  online: boolean;
};

type MapaMorososProps = {
  motos: PuntoMorosoMapa[];
  seleccionada: string | null;
  onSeleccionar: (placa: string) => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
  embebido?: boolean;
};

function htmlMarcador(
  placa: string,
  activa: boolean,
  online: boolean,
): string {
  const bg = activa ? "#be123c" : online ? "#047857" : "#b45309";
  return `<div style="background:${bg};color:#fff;font:700 10px/1.1 ui-monospace,monospace;padding:4px 6px;border-radius:8px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);white-space:nowrap">${placa}</div>`;
}

const CENTRO_COLOMBIA = { lat: 4.65, lng: -74.05 };

export function MapaMorosos({
  motos,
  seleccionada,
  onSeleccionar,
  fullscreen = false,
  onToggleFullscreen,
  className,
  embebido = false,
}: MapaMorososProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const capaMotosRef = useRef<import("leaflet").LayerGroup | null>(null);
  const marcadoresRef = useRef<Map<string, import("leaflet").Marker>>(
    new Map(),
  );
  const ajusteInicialRef = useRef(false);
  const selPrevRef = useRef<string | null>(null);
  const onSelRef = useRef(onSeleccionar);
  const [mapaListo, setMapaListo] = useState(false);
  onSelRef.current = onSeleccionar;

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedorRef.current || mapaRef.current) return;

      const mapa = L.map(contenedorRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([CENTRO_COLOMBIA.lat, CENTRO_COLOMBIA.lng], 11);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(mapa);

      try {
        const res = await fetch("/geo/bogota-localidades.geojson", {
          cache: "force-cache",
        });
        if (res.ok) {
          const geo = await res.json();
          L.geoJSON(geo, {
            style: {
              color: "#64748b",
              weight: 1,
              fillColor: "#334155",
              fillOpacity: 0.12,
            },
          }).addTo(mapa);
        }
      } catch {
        // mapa útil sin localidades
      }

      const capaMotos = L.layerGroup().addTo(mapa);
      mapaRef.current = mapa;
      capaMotosRef.current = capaMotos;
      if (!cancelado) setMapaListo(true);

      requestAnimationFrame(() => mapa.invalidateSize());
      window.setTimeout(() => mapa.invalidateSize(), 100);
      window.setTimeout(() => mapa.invalidateSize(), 350);
    })();

    return () => {
      cancelado = true;
      setMapaListo(false);
      marcadoresRef.current.clear();
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
        capaMotosRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapaListo) return;
    requestAnimationFrame(() => mapaRef.current?.invalidateSize());
  }, [mapaListo, fullscreen]);

  useEffect(() => {
    const mapa = mapaRef.current;
    const capa = capaMotosRef.current;
    if (!mapaListo || !mapa || !capa) return;

    let cancelado = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !capaMotosRef.current) return;

      const vivos = new Set(motos.map((m) => m.placa));
      for (const [placa, marker] of marcadoresRef.current) {
        if (!vivos.has(placa)) {
          capa.removeLayer(marker);
          marcadoresRef.current.delete(placa);
        }
      }

      const bounds: [number, number][] = [];

      for (const m of motos) {
        const activa = m.placa === seleccionada;
        const icon = L.divIcon({
          className: "",
          html: htmlMarcador(m.placa, activa, m.online),
          iconSize: [72, 22],
          iconAnchor: [36, 11],
        });

        let marker = marcadoresRef.current.get(m.placa);
        if (!marker) {
          marker = L.marker([m.lat, m.lng], { icon }).addTo(capa);
          marker.on("click", () => onSelRef.current(m.placa));
          marcadoresRef.current.set(m.placa, marker);
        } else {
          marker.setLatLng([m.lat, m.lng]);
          marker.setIcon(icon);
        }
        marker.bindTooltip(
          `${m.placa} · ${formatearCOP(m.deuda_total)} · ${m.dias_mora}d`,
        );
        bounds.push([m.lat, m.lng]);
      }

      if (!ajusteInicialRef.current && bounds.length > 0) {
        mapa.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        ajusteInicialRef.current = true;
      }

      if (seleccionada && seleccionada !== selPrevRef.current) {
        const sel = motos.find((x) => x.placa === seleccionada);
        if (sel) mapa.panTo([sel.lat, sel.lng], { animate: true });
      }
      selPrevRef.current = seleccionada;
    })();

    return () => {
      cancelado = true;
    };
  }, [mapaListo, motos, seleccionada]);

  useEffect(() => {
    const mapa = mapaRef.current;
    const el = contenedorRef.current?.parentElement;
    if (!mapa || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => mapa.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapaListo, fullscreen]);

  useEffect(() => {
    if (!fullscreen || !onToggleFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, onToggleFullscreen]);

  return (
    <div
      role="region"
      aria-label="Mapa de morosos con GPS"
      className={cn(
        "relative w-full overflow-hidden bg-zinc-900 outline outline-1 outline-white/10",
        fullscreen
          ? "fixed inset-0 z-50 h-dvh w-dvw"
          : embebido
            ? "h-full min-h-[280px] w-full"
            : "h-[min(38vh,340px)] min-h-[240px] shrink-0 w-full",
        className,
      )}
    >
      <div
        ref={contenedorRef}
        className="absolute inset-0 z-0 h-full w-full [&_.leaflet-container]:!h-full [&_.leaflet-container]:!w-full"
      />
      <p className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-md bg-zinc-950/85 px-2 py-1 text-[10px] font-medium text-zinc-300">
        En vivo · {motos.length} con GPS
      </p>
      {onToggleFullscreen ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute right-2 top-2 z-[400] size-11 rounded-lg bg-card/95 shadow-md focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          onClick={onToggleFullscreen}
        >
          {fullscreen ? (
            <Minimize2Icon className="size-5" aria-hidden />
          ) : (
            <Maximize2Icon className="size-5" aria-hidden />
          )}
        </Button>
      ) : null}
    </div>
  );
}
