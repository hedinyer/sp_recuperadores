"use client";

import { useEffect, useRef } from "react";

import type { UbicacionGpsMoto } from "@/lib/systemTrackGps";

export type PuntoRutaGps = { lat: number; lng: number };

type MapaGpsEnVivoProps = {
  gps: UbicacionGpsMoto;
  ruta: PuntoRutaGps[];
  /** Si false, detiene la animación de seguimiento. */
  seguimientoActivo?: boolean;
  /** Duración de la interpolación entre posiciones (ms). */
  duracionSeguimientoMs?: number;
};

type PosAnimada = { lat: number; lng: number; course: number };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngulo(desde: number, hacia: number, t: number): number {
  let diff = ((hacia - desde + 540) % 360) - 180;
  return desde + diff * t;
}

function easeOutQuad(t: number): number {
  return t * (2 - t);
}

function htmlIcono(course: number): string {
  return `<div class="gps-moto-flecha" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;transform:rotate(${course}deg)">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#34d399" stroke="#064e3b" stroke-width="1.5">
      <path d="M12 2 L20 20 L12 16 L4 20 Z"/>
    </svg>
  </div>`;
}

export function MapaGpsEnVivo({
  gps,
  ruta,
  seguimientoActivo = true,
  duracionSeguimientoMs = 240,
}: MapaGpsEnVivoProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const marcadorRef = useRef<import("leaflet").Marker | null>(null);
  const rutaRef = useRef<import("leaflet").Polyline | null>(null);
  const listoRef = useRef(false);

  const mostradoRef = useRef<PosAnimada>({
    lat: gps.lat,
    lng: gps.lng,
    course: gps.course,
  });
  const destinoRef = useRef<PosAnimada>({
    lat: gps.lat,
    lng: gps.lng,
    course: gps.course,
  });
  const animInicioRef = useRef(0);
  const frameRef = useRef(0);
  const duracionRef = useRef(duracionSeguimientoMs);

  useEffect(() => {
    duracionRef.current = duracionSeguimientoMs;
  }, [duracionSeguimientoMs]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      if (cancelado || !contenedorRef.current || listoRef.current) return;

      const mapa = L.map(contenedorRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
        touchZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        pinchZoom: true,
      }).setView([gps.lat, gps.lng], 17);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(mapa);

      const icono = L.divIcon({
        className: "",
        html: htmlIcono(gps.course),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marcador = L.marker([gps.lat, gps.lng], { icon: icono }).addTo(mapa);
      const linea =
        ruta.length > 1
          ? L.polyline(
              ruta.map((p) => [p.lat, p.lng] as [number, number]),
              { color: "#34d399", weight: 3, opacity: 0.85 },
            ).addTo(mapa)
          : null;

      mapaRef.current = mapa;
      marcadorRef.current = marcador;
      rutaRef.current = linea;
      listoRef.current = true;
      mostradoRef.current = { lat: gps.lat, lng: gps.lng, course: gps.course };
      destinoRef.current = { lat: gps.lat, lng: gps.lng, course: gps.course };
    })();

    return () => {
      cancelado = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
        marcadorRef.current = null;
        rutaRef.current = null;
        listoRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!seguimientoActivo) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      return;
    }

    if (!listoRef.current) return;

    const cambio =
      Math.abs(destinoRef.current.lat - gps.lat) > 1e-7 ||
      Math.abs(destinoRef.current.lng - gps.lng) > 1e-7 ||
      Math.abs(destinoRef.current.course - gps.course) > 0.5;

    if (!cambio) return;

    destinoRef.current = {
      lat: gps.lat,
      lng: gps.lng,
      course: gps.course,
    };
    animInicioRef.current = performance.now();

    const tick = () => {
      const mapa = mapaRef.current;
      const marcador = marcadorRef.current;
      if (!mapa || !marcador) return;

      const dur = Math.max(duracionRef.current, 80);
      const raw = Math.min(
        (performance.now() - animInicioRef.current) / dur,
        1,
      );
      const t = easeOutQuad(raw);
      const desde = mostradoRef.current;
      const hacia = destinoRef.current;

      const lat = lerp(desde.lat, hacia.lat, t);
      const lng = lerp(desde.lng, hacia.lng, t);
      const course = lerpAngulo(desde.course, hacia.course, t);
      mostradoRef.current = { lat, lng, course };

      marcador.setLatLng([lat, lng]);
      const flecha = marcador.getElement()?.querySelector(".gps-moto-flecha");
      if (flecha instanceof HTMLElement) {
        flecha.style.transform = `rotate(${course}deg)`;
      }

      const zoom = mapa.getZoom();
      mapa.setView([lat, lng], zoom, { animate: false });

      if (raw < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        mostradoRef.current = { ...hacia };
      }
    };

    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(tick);
  }, [gps.lat, gps.lng, gps.course, seguimientoActivo]);

  useEffect(() => {
    if (!listoRef.current || !mapaRef.current) return;

    void (async () => {
      const L = (await import("leaflet")).default;
      const mapa = mapaRef.current;
      if (!mapa) return;

      const puntos = ruta.map((p) => [p.lat, p.lng] as [number, number]);
      if (ruta.length > 1) {
        if (rutaRef.current) {
          rutaRef.current.setLatLngs(puntos);
        } else {
          rutaRef.current = L.polyline(puntos, {
            color: "#34d399",
            weight: 3,
            opacity: 0.85,
          }).addTo(mapa);
        }
      } else if (rutaRef.current) {
        rutaRef.current.remove();
        rutaRef.current = null;
      }
    })();
  }, [ruta]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div
      ref={contenedorRef}
      className="w-full h-52 rounded-xl z-0"
      role="img"
      aria-label="Mapa en vivo del vehículo"
    />
  );
}
