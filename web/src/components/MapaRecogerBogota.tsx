"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";

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
};

function htmlMarcador(placa: string, activa: boolean, online: boolean): string {
  const bg = activa ? "#be123c" : online ? "#047857" : "#b45309";
  return `<div style="background:${bg};color:#fff;font:700 10px/1.1 ui-monospace,monospace;padding:4px 6px;border-radius:8px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);white-space:nowrap">${placa}</div>`;
}

export function MapaRecogerBogota({
  motos,
  origen,
  radioKm,
  seleccionada,
  onSeleccionar,
}: MapaRecogerBogotaProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const capaMotosRef = useRef<import("leaflet").LayerGroup | null>(null);
  const circuloRef = useRef<import("leaflet").Circle | null>(null);
  const origenMarkerRef = useRef<import("leaflet").CircleMarker | null>(null);
  const marcadoresRef = useRef<
    Map<string, import("leaflet").Marker>
  >(new Map());
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
      }).setView([origen.lat, origen.lng], 11);

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

      circuloRef.current = L.circle([origen.lat, origen.lng], {
        radius: radioKm * 1000,
        color: "#38bdf8",
        weight: 1.5,
        fillColor: "#0ea5e9",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(mapa);

      origenMarkerRef.current = L.circleMarker([origen.lat, origen.lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#38bdf8",
        fillOpacity: 1,
      })
        .bindTooltip("Punto de origen", { direction: "top" })
        .addTo(mapa);

      const capaMotos = L.layerGroup().addTo(mapa);
      mapaRef.current = mapa;
      capaMotosRef.current = capaMotos;
      if (!cancelado) setMapaListo(true);

      requestAnimationFrame(() => mapa.invalidateSize());
    })();

    return () => {
      cancelado = true;
      setMapaListo(false);
      marcadoresRef.current.clear();
      circuloRef.current = null;
      origenMarkerRef.current = null;
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
    mapaRef.current?.panTo([origen.lat, origen.lng], { animate: true });
    ajusteInicialRef.current = false;
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

      const bounds: [number, number][] = [[origen.lat, origen.lng]];

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
          `${m.placa} · ${m.distancia_km != null ? `${m.distancia_km.toFixed(1)} km` : "—"}`,
        );
        bounds.push([m.lat, m.lng]);
      }

      if (!ajusteInicialRef.current && bounds.length > 1) {
        mapa.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
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
  }, [mapaListo, motos, seleccionada, origen.lat, origen.lng]);

  useEffect(() => {
    const mapa = mapaRef.current;
    const el = contenedorRef.current?.parentElement;
    if (!mapa || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      mapa.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapaListo]);

  return (
    <div
      role="region"
      aria-label="Mapa de motos para recoger en Bogotá y alrededores"
      className="relative h-[min(48vh,360px)] min-h-[240px] w-full overflow-hidden border-b border-zinc-800 bg-zinc-900 outline outline-1 outline-white/10 md:h-full md:min-h-0 md:flex-1 md:border-b-0 md:border-r"
    >
      <div ref={contenedorRef} className="absolute inset-0 z-0" />
      <p className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-md bg-zinc-950/80 px-2 py-1 text-[10px] font-medium text-zinc-300">
        En vivo · radio {radioKm} km · {motos.length} motos
      </p>
    </div>
  );
}
