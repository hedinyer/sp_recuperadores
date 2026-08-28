"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";

import type { PuntoRuta } from "@/lib/rutaOsrm";

type ParadaMapa = PuntoRuta & { placa: string; indice: number };

type MapaConducirRutaProps = {
  yo: PuntoRuta | null;
  paradas: ParadaMapa[];
  paradaActual: number;
  rutaCompleta: PuntoRuta[];
  rutaTramo: PuntoRuta[];
  seguirYo?: boolean;
};

function htmlYo(): string {
  return `<div style="width:20px;height:20px;border-radius:999px;background:#38bdf8;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>`;
}

function htmlParada(
  placa: string,
  n: number,
  activa: boolean,
  hecha: boolean,
): string {
  const bg = hecha ? "#64748b" : activa ? "#e11d48" : "#7c3aed";
  return `<div style="display:flex;align-items:center;gap:4px;background:${bg};color:#fff;font:700 11px/1.1 ui-monospace,monospace;padding:5px 7px;border-radius:8px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);white-space:nowrap"><span style="display:inline-flex;min-width:15px;height:15px;align-items:center;justify-content:center;border-radius:999px;background:rgba(255,255,255,.25);font-size:9px">${n}</span>${placa}</div>`;
}

export function MapaConducirRuta({
  yo,
  paradas,
  paradaActual,
  rutaCompleta,
  rutaTramo,
  seguirYo = true,
}: MapaConducirRutaProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const yoRef = useRef<import("leaflet").Marker | null>(null);
  const paradasRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const polyCompletaRef = useRef<import("leaflet").Polyline | null>(null);
  const polyTramoRef = useRef<import("leaflet").Polyline | null>(null);
  const [listo, setListo] = useState(false);
  const ajusteRef = useRef(false);
  const paradaPrevRef = useRef(paradaActual);

  useEffect(() => {
    if (paradaActual !== paradaPrevRef.current) {
      ajusteRef.current = false;
      paradaPrevRef.current = paradaActual;
    }
  }, [paradaActual]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedorRef.current || mapaRef.current) return;

      const mapa = L.map(contenedorRef.current, {
        zoomControl: false,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([4.65, -74.1], 13);

      L.control.zoom({ position: "topleft" }).addTo(mapa);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OSM",
      }).addTo(mapa);

      mapaRef.current = mapa;
      if (!cancelado) setListo(true);
      requestAnimationFrame(() => mapa.invalidateSize());
      window.setTimeout(() => mapa.invalidateSize(), 200);
    })();

    return () => {
      cancelado = true;
      setListo(false);
      yoRef.current = null;
      paradasRef.current.clear();
      polyCompletaRef.current = null;
      polyTramoRef.current = null;
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!listo || !mapaRef.current) return;
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      const mapa = mapaRef.current;
      if (cancelado || !mapa) return;

      if (yo) {
        const icon = L.divIcon({
          className: "",
          html: htmlYo(),
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        if (!yoRef.current) {
          yoRef.current = L.marker([yo.lat, yo.lng], { icon, zIndexOffset: 1000 })
            .bindTooltip("Tú", { direction: "top", permanent: false })
            .addTo(mapa);
        } else {
          yoRef.current.setLatLng([yo.lat, yo.lng]);
        }
      }

      const vivas = new Set(paradas.map((p) => p.placa));
      for (const [placa, marker] of paradasRef.current) {
        if (!vivas.has(placa)) {
          mapa.removeLayer(marker);
          paradasRef.current.delete(placa);
        }
      }

      const bounds: [number, number][] = [];
      if (yo) bounds.push([yo.lat, yo.lng]);

      for (const p of paradas) {
        const hecha = p.indice - 1 < paradaActual;
        const activa = p.indice - 1 === paradaActual;
        const icon = L.divIcon({
          className: "",
          html: htmlParada(p.placa, p.indice, activa, hecha),
          iconSize: [92, 26],
          iconAnchor: [46, 13],
        });
        let marker = paradasRef.current.get(p.placa);
        if (!marker) {
          marker = L.marker([p.lat, p.lng], { icon }).addTo(mapa);
          paradasRef.current.set(p.placa, marker);
        } else {
          marker.setLatLng([p.lat, p.lng]);
          marker.setIcon(icon);
        }
        if (!hecha) bounds.push([p.lat, p.lng]);
      }

      if (polyCompletaRef.current) {
        mapa.removeLayer(polyCompletaRef.current);
        polyCompletaRef.current = null;
      }
      if (rutaCompleta.length >= 2) {
        polyCompletaRef.current = L.polyline(
          rutaCompleta.map((pt) => [pt.lat, pt.lng] as [number, number]),
          { color: "#475569", weight: 4, opacity: 0.45 },
        ).addTo(mapa);
      }

      if (polyTramoRef.current) {
        mapa.removeLayer(polyTramoRef.current);
        polyTramoRef.current = null;
      }
      if (rutaTramo.length >= 2) {
        polyTramoRef.current = L.polyline(
          rutaTramo.map((pt) => [pt.lat, pt.lng] as [number, number]),
          { color: "#38bdf8", weight: 7, opacity: 0.95 },
        ).addTo(mapa);
      }

      if (!ajusteRef.current && bounds.length > 0) {
        mapa.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
        ajusteRef.current = true;
      } else if (seguirYo && yo) {
        mapa.panTo([yo.lat, yo.lng], { animate: true, duration: 0.4 });
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [listo, yo, paradas, paradaActual, rutaCompleta, rutaTramo, seguirYo]);

  useEffect(() => {
    const mapa = mapaRef.current;
    const el = contenedorRef.current;
    if (!mapa || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => mapa.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [listo]);

  return (
    <div className="h-full w-full bg-zinc-900">
      <div
        ref={contenedorRef}
        className="h-full w-full [&_.leaflet-bottom.leaflet-right]:bottom-3 [&_.leaflet-container]:!h-full [&_.leaflet-container]:!w-full"
      />
    </div>
  );
}
