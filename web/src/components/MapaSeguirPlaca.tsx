"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";

import type { PuntoRuta } from "@/lib/rutaOsrm";

type MapaSeguirPlacaProps = {
  yo: PuntoRuta | null;
  moto: PuntoRuta | null;
  ruta: PuntoRuta[];
  placa: string;
  /** Si true, el mapa sigue tú+moto (o solo la moto). */
  seguir: boolean;
  onUsuarioMueveMapa?: () => void;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function htmlYo(): string {
  return `<div style="width:18px;height:18px;border-radius:999px;background:#38bdf8;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)"></div>`;
}

function htmlMoto(placa: string): string {
  return `<div style="background:#be123c;color:#fff;font:700 10px/1.1 ui-monospace,monospace;padding:4px 6px;border-radius:8px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);white-space:nowrap">${placa}</div>`;
}

export function MapaSeguirPlaca({
  yo,
  moto,
  ruta,
  placa,
  seguir,
  onUsuarioMueveMapa,
}: MapaSeguirPlacaProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<import("leaflet").Map | null>(null);
  const yoRef = useRef<import("leaflet").Marker | null>(null);
  const motoRef = useRef<import("leaflet").Marker | null>(null);
  const polyRef = useRef<import("leaflet").Polyline | null>(null);
  const [listo, setListo] = useState(false);
  const ajusteInicialRef = useRef(false);
  const ignorarMovimientoRef = useRef(false);
  const onUsuarioMueveMapaRef = useRef(onUsuarioMueveMapa);
  onUsuarioMueveMapaRef.current = onUsuarioMueveMapa;

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !contenedorRef.current || mapaRef.current) return;

      const mapa = L.map(contenedorRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([4.65, -74.1], 12);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      }).addTo(mapa);

      mapa.on("dragstart", () => {
        if (ignorarMovimientoRef.current) return;
        onUsuarioMueveMapaRef.current?.();
      });

      mapaRef.current = mapa;
      if (!cancelado) setListo(true);
      requestAnimationFrame(() => mapa.invalidateSize());
    })();

    return () => {
      cancelado = true;
      setListo(false);
      yoRef.current = null;
      motoRef.current = null;
      polyRef.current = null;
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
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        if (!yoRef.current) {
          yoRef.current = L.marker([yo.lat, yo.lng], { icon })
            .bindTooltip("Tú", { direction: "top" })
            .addTo(mapa);
        } else {
          yoRef.current.setLatLng([yo.lat, yo.lng]);
          yoRef.current.setIcon(icon);
        }
      }

      if (moto) {
        const icon = L.divIcon({
          className: "",
          html: htmlMoto(placa),
          iconSize: [72, 22],
          iconAnchor: [36, 11],
        });
        if (!motoRef.current) {
          motoRef.current = L.marker([moto.lat, moto.lng], { icon })
            .bindTooltip(placa, { direction: "top" })
            .addTo(mapa);
        } else {
          motoRef.current.setLatLng([moto.lat, moto.lng]);
          motoRef.current.setIcon(icon);
        }
      }

      const latlngs =
        ruta.length >= 2
          ? ruta.map((p) => [p.lat, p.lng] as [number, number])
          : yo && moto
            ? [
                [yo.lat, yo.lng] as [number, number],
                [moto.lat, moto.lng] as [number, number],
              ]
            : moto
              ? [[moto.lat, moto.lng] as [number, number]]
              : [];

      if (latlngs.length >= 2) {
        if (!polyRef.current) {
          polyRef.current = L.polyline(latlngs, {
            color: "#38bdf8",
            weight: 4,
            opacity: 0.85,
          }).addTo(mapa);
        } else {
          polyRef.current.setLatLngs(latlngs);
        }
      } else if (polyRef.current) {
        mapa.removeLayer(polyRef.current);
        polyRef.current = null;
      }

      if (latlngs.length === 0) return;

      const reduceMotion = prefersReducedMotion();
      const animar = !reduceMotion;

      ignorarMovimientoRef.current = true;
      const liberar = () => {
        window.setTimeout(() => {
          ignorarMovimientoRef.current = false;
        }, 80);
      };

      if (!ajusteInicialRef.current) {
        if (latlngs.length >= 2) {
          mapa.fitBounds(latlngs, {
            padding: [40, 40],
            maxZoom: 16,
            animate: animar,
          });
        } else {
          mapa.setView(latlngs[0], 15, { animate: animar });
        }
        ajusteInicialRef.current = true;
        liberar();
        return;
      }

      if (!seguir) {
        liberar();
        return;
      }

      if (latlngs.length >= 2) {
        mapa.fitBounds(latlngs, {
          padding: [48, 48],
          maxZoom: 16,
          animate: animar,
        });
      } else if (moto) {
        if (animar) {
          mapa.panTo([moto.lat, moto.lng], { animate: true, duration: 0.4 });
        } else {
          mapa.setView([moto.lat, moto.lng], mapa.getZoom(), { animate: false });
        }
      }
      liberar();
    })();

    return () => {
      cancelado = true;
    };
  }, [listo, yo, moto, ruta, placa, seguir]);

  return (
    <div
      role="region"
      aria-label={`Mapa de seguimiento de ${placa}`}
      className="relative flex-1 min-h-[280px] w-full overflow-hidden bg-zinc-900"
    >
      <div ref={contenedorRef} className="absolute inset-0 z-0" />
    </div>
  );
}
