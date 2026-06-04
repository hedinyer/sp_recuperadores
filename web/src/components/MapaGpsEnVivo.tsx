"use client";

import "leaflet/dist/leaflet.css";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  duracionAnimacionGpsInicial,
  type ProveedorGps,
  type UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

export type PuntoRutaGps = { lat: number; lng: number };

type MapaGpsEnVivoProps = {
  gps: UbicacionGpsMoto;
  ruta: PuntoRutaGps[];
  seguimientoActivo?: boolean;
  proveedor?: ProveedorGps;
};

type PosAnimada = { lat: number; lng: number; course: number };

const DURACION_ANIM_MIN_MS = 2000;
const DURACION_ANIM_MAX_MS = 30_000;
const UMBRAL_MOVIMIENTO = 1e-7;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngulo(desde: number, hacia: number, t: number): number {
  const diff = ((hacia - desde + 540) % 360) - 180;
  return desde + diff * t;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function htmlIcono(course: number): string {
  return `<div class="gps-moto-flecha" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;transform:rotate(${course}deg)">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#34d399" stroke="#064e3b" stroke-width="1.5">
      <path d="M12 2 L20 20 L12 16 L4 20 Z"/>
    </svg>
  </div>`;
}

function deltaMetros(
  speedKmh: number,
  courseDeg: number,
  lat: number,
  segundos: number,
): { dLat: number; dLng: number } {
  if (speedKmh < 0.5 || segundos <= 0) return { dLat: 0, dLng: 0 };
  const metros = (speedKmh / 3.6) * segundos * 0.55;
  const rad = (courseDeg * Math.PI) / 180;
  const dLat = (metros * Math.cos(rad)) / 111_320;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLng =
    metros !== 0
      ? (metros * Math.sin(rad)) / (111_320 * Math.max(0.2, Math.abs(cosLat)))
      : 0;
  return { dLat, dLng };
}

export function MapaGpsEnVivo({
  gps,
  ruta,
  seguimientoActivo = true,
  proveedor = gps.proveedor,
}: MapaGpsEnVivoProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const marcadorRef = useRef<import("leaflet").Marker | null>(null);
  const rutaRef = useRef<import("leaflet").Polyline | null>(null);
  const [mapaListo, setMapaListo] = useState(false);

  const mostradoRef = useRef<PosAnimada>({
    lat: gps.lat,
    lng: gps.lng,
    course: gps.course,
  });
  const origenRef = useRef<PosAnimada>({
    lat: gps.lat,
    lng: gps.lng,
    course: gps.course,
  });
  const destinoRef = useRef<PosAnimada>({
    lat: gps.lat,
    lng: gps.lng,
    course: gps.course,
  });
  const velocidadRef = useRef(gps.speed);
  const animInicioRef = useRef(performance.now());
  const duracionRef = useRef(duracionAnimacionGpsInicial(proveedor));
  const ultimoFixMsRef = useRef(performance.now());
  const ultimoFrameMsRef = useRef(performance.now());
  const frameRef = useRef(0);

  useEffect(() => {
    velocidadRef.current = gps.speed;
  }, [gps.speed]);

  useEffect(() => {
    duracionRef.current = duracionAnimacionGpsInicial(proveedor);
  }, [proveedor]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;

      if (cancelado || !contenedorRef.current) return;

      const mapa = L.map(contenedorRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
        touchZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
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

      const pos = { lat: gps.lat, lng: gps.lng, course: gps.course };
      mostradoRef.current = { ...pos };
      origenRef.current = { ...pos };
      destinoRef.current = { ...pos };
      const ahora = performance.now();
      animInicioRef.current = ahora;
      ultimoFixMsRef.current = ahora;
      ultimoFrameMsRef.current = ahora;

      mapa.invalidateSize();
      if (!cancelado) setMapaListo(true);
    })();

    return () => {
      cancelado = true;
      setMapaListo(false);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
        marcadorRef.current = null;
        rutaRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registrarNuevoFix = useCallback((lat: number, lng: number, course: number, speed: number) => {
    const cambio =
      Math.abs(destinoRef.current.lat - lat) > UMBRAL_MOVIMIENTO ||
      Math.abs(destinoRef.current.lng - lng) > UMBRAL_MOVIMIENTO ||
      Math.abs(destinoRef.current.course - course) > 0.5;

    if (!cambio) {
      velocidadRef.current = speed;
      return;
    }

    const ahora = performance.now();
    const medido = ahora - ultimoFixMsRef.current;
    if (medido >= DURACION_ANIM_MIN_MS) {
      duracionRef.current = clamp(
        duracionRef.current * 0.35 + medido * 0.65,
        DURACION_ANIM_MIN_MS,
        DURACION_ANIM_MAX_MS,
      );
    }
    ultimoFixMsRef.current = ahora;

    origenRef.current = { ...mostradoRef.current };
    destinoRef.current = { lat, lng, course };
    velocidadRef.current = speed;
    animInicioRef.current = ahora;
  }, []);

  useEffect(() => {
    if (!mapaListo) return;
    registrarNuevoFix(gps.lat, gps.lng, gps.course, gps.speed);
  }, [mapaListo, gps.lat, gps.lng, gps.course, gps.speed, registrarNuevoFix]);

  useEffect(() => {
    if (!mapaListo || !seguimientoActivo) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      return;
    }

    const aplicarPosicion = (lat: number, lng: number, course: number) => {
      const mapa = mapaRef.current;
      const marcador = marcadorRef.current;
      if (!mapa || !marcador) return;

      mostradoRef.current = { lat, lng, course };
      marcador.setLatLng([lat, lng]);
      const flecha = marcador.getElement()?.querySelector(".gps-moto-flecha");
      if (flecha instanceof HTMLElement) {
        flecha.style.transform = `rotate(${course}deg)`;
      }
      mapa.setView([lat, lng], mapa.getZoom(), { animate: false });
    };

    const tick = (now: number) => {
      const prevFrame = ultimoFrameMsRef.current || now;
      ultimoFrameMsRef.current = now;
      const dtSeg = Math.min((now - prevFrame) / 1000, 0.12);

      const dur = Math.max(duracionRef.current, DURACION_ANIM_MIN_MS);
      const raw = Math.min((now - animInicioRef.current) / dur, 1);
      const desde = origenRef.current;
      const hacia = destinoRef.current;

      let lat: number;
      let lng: number;
      let course: number;

      if (raw < 1) {
        lat = lerp(desde.lat, hacia.lat, raw);
        lng = lerp(desde.lng, hacia.lng, raw);
        course = lerpAngulo(desde.course, hacia.course, raw);
      } else {
        const prev = mostradoRef.current;
        const vel = velocidadRef.current;
        if (vel >= 0.5) {
          const { dLat, dLng } = deltaMetros(vel, prev.course, prev.lat, dtSeg);
          lat = prev.lat + dLat;
          lng = prev.lng + dLng;
          course = prev.course;
        } else {
          lat = hacia.lat;
          lng = hacia.lng;
          course = hacia.course;
        }
      }

      aplicarPosicion(lat, lng, course);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [mapaListo, seguimientoActivo]);

  useEffect(() => {
    if (!mapaListo || !mapaRef.current) return;

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
  }, [mapaListo, ruta]);

  return (
    <div
      ref={contenedorRef}
      className="w-full h-52 rounded-xl z-0"
      role="img"
      aria-label="Mapa en vivo del vehículo"
    />
  );
}
