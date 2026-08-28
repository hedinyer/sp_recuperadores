"use client";

import "leaflet/dist/leaflet.css";

import { Maximize2Icon, Minimize2Icon, HexagonIcon, RouteIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatearCOP } from "@/lib/formatoDinero";
import type { PuntoRuta } from "@/lib/rutaOsrm";
import { cn } from "@/lib/utils";

export type PuntoMotoMapa = {
  placa: string;
  lat: number;
  lng: number;
  deuda_total: number;
  distancia_km: number | null;
  online: boolean;
};

type OrigenMapa = { lat: number; lng: number };

type MapaRecogerBogotaProps = {
  motos: PuntoMotoMapa[];
  origen: OrigenMapa;
  radioKm: number;
  seleccionada: string | null;
  onSeleccionar: (placa: string) => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
  /** Ocupa 100% del contenedor padre (layout embebido). */
  embebido?: boolean;
  modoGeocerca?: boolean;
  verticesGeocerca?: PuntoRuta[];
  poligonoGeocerca?: PuntoRuta[] | null;
  onClickGeocerca?: (punto: PuntoRuta) => void;
  placasSeleccionadas?: Set<string>;
  rutaPolyline?: PuntoRuta[];
  onToggleGeocerca?: () => void;
  onCerrarGeocerca?: () => void;
  onLimpiarGeocerca?: () => void;
  onGenerarRuta?: () => void;
  generandoRuta?: boolean;
  placasEnRutaCount?: number;
  puedeGenerarRuta?: boolean;
};

function htmlMarcador(
  placa: string,
  activa: boolean,
  online: boolean,
  enRuta: boolean,
): string {
  const bg = activa
    ? "#be123c"
    : enRuta
      ? "#7c3aed"
      : online
        ? "#047857"
        : "#b45309";
  return `<div style="background:${bg};color:#fff;font:700 10px/1.1 ui-monospace,monospace;padding:4px 6px;border-radius:8px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);white-space:nowrap">${placa}</div>`;
}

export function MapaRecogerBogota({
  motos,
  origen,
  radioKm,
  seleccionada,
  onSeleccionar,
  fullscreen = false,
  onToggleFullscreen,
  className,
  embebido = false,
  modoGeocerca = false,
  verticesGeocerca = [],
  poligonoGeocerca = null,
  onClickGeocerca,
  placasSeleccionadas,
  rutaPolyline = [],
  onToggleGeocerca,
  onCerrarGeocerca,
  onLimpiarGeocerca,
  onGenerarRuta,
  generandoRuta = false,
  placasEnRutaCount = 0,
  puedeGenerarRuta = false,
}: MapaRecogerBogotaProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const capaMotosRef = useRef<import("leaflet").LayerGroup | null>(null);
  const capaOverlayRef = useRef<import("leaflet").LayerGroup | null>(null);
  const circuloRef = useRef<import("leaflet").Circle | null>(null);
  const origenMarkerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const marcadoresRef = useRef<
    Map<string, import("leaflet").Marker>
  >(new Map());
  const selPrevRef = useRef<string | null>(null);
  const onSelRef = useRef(onSeleccionar);
  const onGeoRef = useRef(onClickGeocerca);
  const modoGeoRef = useRef(modoGeocerca);
  const origenRef = useRef(origen);
  const [mapaListo, setMapaListo] = useState(false);
  onSelRef.current = onSeleccionar;
  onGeoRef.current = onClickGeocerca;
  modoGeoRef.current = modoGeocerca;
  origenRef.current = origen;

  function centrarEnOrigen(animar = false) {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const { lat, lng } = origenRef.current;
    if (circuloRef.current) {
      mapa.fitBounds(circuloRef.current.getBounds(), {
        padding: [28, 28],
        maxZoom: 14,
        animate: animar,
      });
    } else {
      mapa.setView([lat, lng], 12, { animate: animar });
    }
  }

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedorRef.current || mapaRef.current) return;

      const o = origenRef.current;
      const mapa = L.map(contenedorRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([o.lat, o.lng], 12);

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
              fillOpacity: 0.18,
            },
            onEachFeature: (feature, layer) => {
              const nombre = feature.properties?.nombre;
              if (nombre) layer.bindTooltip(String(nombre), { sticky: true });
            },
          }).addTo(mapa);
        }
      } catch {
        // ponytail: mapa útil sin localidades si falla el geojson
      }

      circuloRef.current = L.circle([o.lat, o.lng], {
        radius: radioKm * 1000,
        color: "#38bdf8",
        weight: 1.5,
        fillColor: "#0ea5e9",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(mapa);

      origenMarkerRef.current = L.circleMarker([o.lat, o.lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#38bdf8",
        fillOpacity: 1,
      })
        .bindTooltip("Punto de origen", { direction: "top" })
        .addTo(mapa);

      const capaMotos = L.layerGroup().addTo(mapa);
      const capaOverlay = L.layerGroup().addTo(mapa);
      mapaRef.current = mapa;
      capaMotosRef.current = capaMotos;
      capaOverlayRef.current = capaOverlay;

      mapa.on("click", (e) => {
        if (!modoGeoRef.current) return;
        onGeoRef.current?.({
          lat: e.latlng.lat,
          lng: e.latlng.lng,
        });
      });

      if (!cancelado) setMapaListo(true);

      centrarEnOrigen(false);

      requestAnimationFrame(() => mapa.invalidateSize());
      window.setTimeout(() => mapa.invalidateSize(), 100);
      window.setTimeout(() => mapa.invalidateSize(), 350);
    })();

    return () => {
      cancelado = true;
      setMapaListo(false);
      marcadoresRef.current.clear();
      circuloRef.current = null;
      origenMarkerRef.current = null;
      capaOverlayRef.current = null;
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
        capaMotosRef.current = null;
      }
    };
    // Solo montar el mapa una vez; origen/radio se actualizan en otro efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapaListo) return;
    circuloRef.current?.setLatLng([origen.lat, origen.lng]);
    circuloRef.current?.setRadius(radioKm * 1000);
    origenMarkerRef.current?.setLatLng([origen.lat, origen.lng]);
    centrarEnOrigen(true);
  }, [mapaListo, origen.lat, origen.lng, radioKm]);

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

      for (const m of motos) {
        const activa = m.placa === seleccionada;
        const enRuta = placasSeleccionadas?.has(m.placa) ?? false;
        const icon = L.divIcon({
          className: "",
          html: htmlMarcador(m.placa, activa, m.online, enRuta),
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
          `${m.placa} · ${formatearCOP(m.deuda_total)}${m.distancia_km != null ? ` · ${m.distancia_km.toFixed(1)} km` : ""}`,
        );
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
  }, [mapaListo, motos, seleccionada, placasSeleccionadas]);

  useEffect(() => {
    const capa = capaOverlayRef.current;
    const mapa = mapaRef.current;
    if (!mapaListo || !capa || !mapa) return;

    let cancelado = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado) return;
      capa.clearLayers();

      const verts =
        poligonoGeocerca && poligonoGeocerca.length >= 3
          ? poligonoGeocerca
          : verticesGeocerca;

      if (verts.length >= 2) {
        const latlngs = verts.map((v) => [v.lat, v.lng] as [number, number]);
        if (poligonoGeocerca && poligonoGeocerca.length >= 3) {
          L.polygon(latlngs, {
            color: "#a855f7",
            weight: 2,
            fillColor: "#a855f7",
            fillOpacity: 0.15,
          }).addTo(capa);
        } else {
          L.polyline(latlngs, {
            color: "#a855f7",
            weight: 2,
            dashArray: "6 6",
          }).addTo(capa);
        }
        for (const v of verticesGeocerca) {
          L.circleMarker([v.lat, v.lng], {
            radius: 5,
            color: "#fff",
            weight: 2,
            fillColor: "#a855f7",
            fillOpacity: 1,
          }).addTo(capa);
        }
      }

      if (rutaPolyline.length >= 2) {
        L.polyline(
          rutaPolyline.map((p) => [p.lat, p.lng] as [number, number]),
          { color: "#38bdf8", weight: 5, opacity: 0.9 },
        ).addTo(capa);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [
    mapaListo,
    verticesGeocerca,
    poligonoGeocerca,
    rutaPolyline,
  ]);

  useEffect(() => {
    if (!mapaListo || !mapaRef.current) return;
    if (modoGeocerca) {
      mapaRef.current.getContainer().style.cursor = "crosshair";
    } else {
      mapaRef.current.getContainer().style.cursor = "";
    }
  }, [mapaListo, modoGeocerca]);

  useEffect(() => {
    if (!mapaListo) return;
    requestAnimationFrame(() => {
      mapaRef.current?.invalidateSize();
      if (fullscreen) centrarEnOrigen(false);
    });
  }, [mapaListo, fullscreen]);

  useEffect(() => {
    const mapa = mapaRef.current;
    const el = contenedorRef.current?.parentElement;
    if (!mapa || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      mapa.invalidateSize();
    });
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
      aria-label="Mapa de motos para recoger en Bogotá y alrededores"
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
      <p className="pointer-events-none absolute bottom-2 left-2 z-[400] max-w-[calc(100%-5rem)] rounded-md bg-zinc-950/85 px-2 py-1 text-[10px] font-medium text-zinc-300">
        {modoGeocerca
          ? `Geomalla · ${verticesGeocerca.length} puntos · toca para añadir`
          : poligonoGeocerca
            ? `Zona activa · ${placasEnRutaCount} moto${placasEnRutaCount === 1 ? "" : "s"} en ruta`
            : `En vivo · ${radioKm} km · ${motos.length} motos`}
      </p>

      {onToggleGeocerca ? (
        <div className="absolute left-2 top-14 z-[400] flex flex-col gap-1.5">
          <Button
            type="button"
            variant={modoGeocerca ? "default" : "secondary"}
            size="sm"
            className="h-10 rounded-lg bg-card/95 shadow-md"
            onClick={onToggleGeocerca}
          >
            <HexagonIcon className="mr-1.5 size-4" aria-hidden />
            {modoGeocerca ? "Dibujando…" : "Geomalla"}
          </Button>
          {modoGeocerca && verticesGeocerca.length >= 3 && !poligonoGeocerca ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-10 rounded-lg bg-card/95 shadow-md"
              onClick={onCerrarGeocerca}
            >
              Cerrar polígono
            </Button>
          ) : null}
          {(verticesGeocerca.length > 0 || poligonoGeocerca) && onLimpiarGeocerca ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg bg-card/80 shadow-md"
              onClick={onLimpiarGeocerca}
            >
              <Trash2Icon className="mr-1 size-3.5" aria-hidden />
              Borrar zona
            </Button>
          ) : null}
        </div>
      ) : null}

      {puedeGenerarRuta && onGenerarRuta ? (
        <Button
          type="button"
          disabled={generandoRuta || placasEnRutaCount === 0}
          className="absolute bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-2 z-[1000] h-12 rounded-xl bg-rose-600 px-4 text-sm font-bold shadow-lg hover:bg-rose-500 disabled:opacity-60 max-[420px]:right-2 max-[420px]:left-2 sm:right-auto"
          onClick={onGenerarRuta}
        >
          <RouteIcon className="mr-2 size-5" aria-hidden />
          {generandoRuta
            ? "Generando ruta…"
            : placasEnRutaCount === 0
              ? "Sin motos en geomalla"
              : `Compartir ruta · ${placasEnRutaCount} moto${placasEnRutaCount === 1 ? "" : "s"}`}
        </Button>
      ) : null}
      {onToggleFullscreen ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute right-2 top-2 z-[400] size-11 rounded-lg bg-card/95 shadow-md focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            fullscreen ? "Salir de pantalla completa" : "Mapa pantalla completa"
          }
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
