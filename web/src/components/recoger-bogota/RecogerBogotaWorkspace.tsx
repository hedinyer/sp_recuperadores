"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CrosshairIcon,
  MoreHorizontalIcon,
  NavigationIcon,
  PhoneIcon,
  RefreshCwIcon,
  RouteIcon,
  Share2Icon,
  XIcon,
} from "lucide-react";

import { MapaRecogerBogota } from "@/components/MapaRecogerBogota";
import { RecogerBogotaFila } from "@/components/recoger-bogota/RecogerBogotaFila";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { EstadoGpsPlaca } from "@/lib/gpsEstadoPlacas";
import { filtrarPuntosEnPoligono } from "@/lib/geocerca";
import { formatearCOP } from "@/lib/formatoDinero";
import { obtenerGpsPreciso, mensajeErrorGps } from "@/lib/geolocation";
import {
  enlaceRutaCompartida,
  type ParadaRuta,
  type RutaCompartida,
} from "@/lib/rutaCompartida";
import {
  optimizarOrdenParadasOsrm,
  obtenerRutaCompleta,
} from "@/lib/rutaMultiParada";
import type { PuntoRuta } from "@/lib/rutaOsrm";
import type { FuenteUbicacion } from "@/lib/ubicacionFusion";
import {
  fusionarTelemetriaSticky,
  type PosicionAirTagLive,
  type PosicionGpsLive,
} from "@/lib/ubicacionFusion";
import type { ProveedorGps } from "@/lib/ubicacionGps";
import { cn } from "@/lib/utils";

const DEUDA_MIN_RECOGER_CAMPO_COP = 700_000;
const DISTANCIA_MAX_RECOGER_KM = 30;
const ORIGEN_DEFAULT = { lat: 4.667372044635534, lng: -74.06239794213879 } as const;
const STORAGE_ORIGEN_KEY = "recoger-bogota-origen";
/** Poll más espaciado: menos parpadeo y menos carga a proveedores. */
const POLL_GPS_VIVO_MS = 5_000;

type VistaTab = "recoger" | "llamar";
type OrigenGps = { lat: number; lng: number };

type MotoRecogerBogota = {
  placa: string;
  nombre: string;
  telefono: string;
  cedula: string;
  deuda_total: number;
  cuotas_pendientes: number;
  valor_cuota: number;
  pago_hoy: boolean;
  origen?: "pinilla" | "railway";
  lat: number | null;
  lng: number | null;
  distancia_km: number | null;
  gps: EstadoGpsPlaca;
  fuentes: { gps: boolean; airtag: boolean };
  fuente_preferida: FuenteUbicacion | null;
  fuente_activa: FuenteUbicacion | null;
  airtag: {
    visto_en: string | null;
    accuracy_m: number | null;
  } | null;
  gps_pos: PosicionGpsLive | null;
  airtag_pos: PosicionAirTagLive | null;
  gps_proveedor: ProveedorGps | null;
  frecuencia_etiqueta: string;
  dias_promedio_entre_pagos: number;
  pagos_irregulares: boolean;
};

type ResumenRecogerBogota = {
  total: number;
  con_gps: number;
  con_ubicacion?: number;
  deuda_total: number;
  generado_en: string;
};

function distanciaKm(a: OrigenGps, b: OrigenGps): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatearOrigenInput(o: OrigenGps): string {
  return `${o.lat}, ${o.lng}`;
}

function parseOrigenCoords(raw: string): OrigenGps | null {
  const m = String(raw)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

function leerOrigenGuardado(): OrigenGps {
  try {
    const raw = localStorage.getItem(STORAGE_ORIGEN_KEY);
    if (!raw) return { ...ORIGEN_DEFAULT };
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { lat, lng };
    }
  } catch {
    // fallback
  }
  return { ...ORIGEN_DEFAULT };
}

function hayOrigenGuardado(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_ORIGEN_KEY));
  } catch {
    return false;
  }
}

function digitosTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

function enlaceTel(telefono: string): string | null {
  const digits = digitosTelefono(telefono);
  if (digits.length < 7) return null;
  return `tel:${digits}`;
}

function enlaceMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function enlaceSeguirPlaca(placa: string): string {
  if (typeof window === "undefined") return `/seguir/${placa}`;
  return `${window.location.origin}/seguir/${encodeURIComponent(placa)}`;
}

function mensajeAvisoUrgente(nombre: string, monto: number): string {
  const n = nombre.trim() || "cliente";
  const montoFmt = formatearCOP(monto);
  return `⚠️ AVISO URGENTE — Sr. ${n}
Su crédito de motocicleta presenta un saldo vencido de:
💰 ${montoFmt}
Este es su último aviso. De no recibir su pago en las próximas 8 horas, su caso pasará automáticamente a:
🔴 Cobro de multa por mora
🔴 Apagado de moto
🔴 Recogida de su moto
🔴 Incremento del saldo por multa
✅ Evite todo esto hoy mismo:
Pago por Nequi, Davivienda, Bancolombia, o Efectivo.
📲 Enviame comprobante de pago por este medio.
La decisión está en sus manos, Sr. ${n}.
Resolverlo hoy le cuesta ${montoFmt}. No resolverlo puede costarle más.
Quedo atento a su respuesta. 🙏`;
}

function PanelLista({
  lista,
  loading,
  modo,
  seleccionada,
  onSeleccionar,
  avisoCopiado,
  linkCopiado,
  onCopiarAviso,
  onCompartirSeguimiento,
  modoRuta,
  placasSeleccionadas,
  onToggleRuta,
  compacta,
}: {
  lista: MotoRecogerBogota[];
  loading: boolean;
  modo: VistaTab;
  seleccionada: string | null;
  onSeleccionar: (placa: string) => void;
  avisoCopiado: string | null;
  linkCopiado: string | null;
  onCopiarAviso: (m: MotoRecogerBogota) => void;
  onCompartirSeguimiento: (placa: string) => void;
  modoRuta?: boolean;
  placasSeleccionadas?: Set<string>;
  onToggleRuta?: (placa: string) => void;
  compacta?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-2" aria-busy="true">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  if (lista.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm font-medium">Nadie en esta lista</p>
        <p className="text-sm text-pretty text-muted-foreground">
          {modo === "recoger"
            ? "No hay motos con ubicación cerca. Toca Mi ubicación."
            : "No hay motos para llamar ahora."}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 p-2" role="list">
      {lista.map((m, i) => (
        <li key={m.placa}>
          <RecogerBogotaFila
            moto={m}
            indice={i + 1}
            seleccionada={seleccionada === m.placa}
            onSeleccionar={() => onSeleccionar(m.placa)}
            onCopiarAviso={() => onCopiarAviso(m)}
            avisoCopiado={avisoCopiado === m.placa}
            onCompartirSeguimiento={() => onCompartirSeguimiento(m.placa)}
            linkCopiado={linkCopiado === m.placa}
            enlaceSeguir={enlaceSeguirPlaca(m.placa)}
            enlaceMaps={
              m.lat != null && m.lng != null ? enlaceMaps(m.lat, m.lng) : null
            }
            enlaceTel={enlaceTel(m.telefono)}
            modo={modo}
            modoRuta={modoRuta}
            enRuta={placasSeleccionadas?.has(m.placa)}
            onToggleRuta={
              onToggleRuta ? () => onToggleRuta(m.placa) : undefined
            }
            compacta={compacta}
          />
        </li>
      ))}
    </ul>
  );
}

export function RecogerBogotaWorkspace() {
  const [motos, setMotos] = useState<MotoRecogerBogota[]>([]);
  const [_resumen, setResumen] = useState<ResumenRecogerBogota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<VistaTab>("recoger");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [actualizadoEnVivo, setActualizadoEnVivo] = useState<string | null>(null);
  const [origen, setOrigen] = useState<OrigenGps>(() => leerOrigenGuardado());
  const [coordsInput, setCoordsInput] = useState(() =>
    formatearOrigenInput(leerOrigenGuardado()),
  );
  const [origenError, setOrigenError] = useState<string | null>(null);
  const [mostrarCoords, setMostrarCoords] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);
  const [avisoCopiado, setAvisoCopiado] = useState<string | null>(null);
  const [mapaFullscreen, setMapaFullscreen] = useState(false);
  const [listaOverlay, setListaOverlay] = useState(true);
  const [esDesktop, setEsDesktop] = useState(false);
  const [masAcciones, setMasAcciones] = useState(false);

  const [modoGeocerca, setModoGeocerca] = useState(false);
  const [verticesGeocerca, setVerticesGeocerca] = useState<PuntoRuta[]>([]);
  const [poligonoGeocerca, setPoligonoGeocerca] = useState<PuntoRuta[] | null>(
    null,
  );
  const [placasSeleccionadas, setPlacasSeleccionadas] = useState<Set<string>>(
    () => new Set(),
  );
  const [rutaPolyline, setRutaPolyline] = useState<PuntoRuta[]>([]);
  const [generandoRuta, setGenerandoRuta] = useState(false);
  const [rutaLinkCopiado, setRutaLinkCopiado] = useState(false);
  const [rutaError, setRutaError] = useState<string | null>(null);
  const [gpsOrigenCargando, setGpsOrigenCargando] = useState(false);
  const gpsAutoIntentado = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setEsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const guardarOrigen = useCallback((next: OrigenGps) => {
    setOrigen(next);
    setCoordsInput(formatearOrigenInput(next));
    setOrigenError(null);
    try {
      localStorage.setItem(STORAGE_ORIGEN_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const aplicarOrigen = useCallback(() => {
    const next = parseOrigenCoords(coordsInput);
    if (!next) {
      setOrigenError("Escribe latitud y longitud, ej. 4.66, -74.06");
      return;
    }
    guardarOrigen(next);
  }, [coordsInput, guardarOrigen]);

  const usarMiGpsOrigen = useCallback(async () => {
    setGpsOrigenCargando(true);
    setOrigenError(null);
    try {
      const res = await obtenerGpsPreciso({ samples: 3, maxWaitMs: 25_000 });
      if (!res.ok) {
        setOrigenError(mensajeErrorGps(res.motivo));
        return;
      }
      guardarOrigen({ lat: res.gps.lat, lng: res.gps.lng });
    } finally {
      setGpsOrigenCargando(false);
    }
  }, [guardarOrigen]);

  // Auto-GPS al entrar a Recoger si no hay origen guardado
  useEffect(() => {
    if (vista !== "recoger" || gpsAutoIntentado.current || esDesktop) return;
    if (hayOrigenGuardado()) return;
    gpsAutoIntentado.current = true;
    void usarMiGpsOrigen();
  }, [vista, esDesktop, usarMiGpsOrigen]);

  const cargar = useCallback(async (force = false) => {
    const q = force ? "?refresh=1" : "";
    const res = await fetch(`/api/placas/recoger-bogota${q}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Error al cargar");
    setMotos(
      (data.motos ?? []).map(
        (m: MotoRecogerBogota): MotoRecogerBogota => ({
          ...m,
          fuentes: m.fuentes ?? { gps: Boolean(m.gps?.funcional), airtag: false },
          fuente_preferida:
            m.fuente_preferida ??
            m.fuente_activa ??
            (m.lat != null ? "gps" : null),
          fuente_activa: m.fuente_activa ?? (m.lat != null ? "gps" : null),
          airtag: m.airtag ?? null,
          gps_pos: m.gps_pos ?? null,
          airtag_pos: m.airtag_pos ?? null,
          gps_proveedor: m.gps_proveedor ?? m.gps?.proveedor ?? null,
        }),
      ),
    );
    setResumen(data.resumen ?? null);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cargar()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cargar]);

  const placasLiveRef = useRef<string[]>([]);
  placasLiveRef.current = motos
    .filter(
      (m) =>
        m.origen === "pinilla" || m.deuda_total >= DEUDA_MIN_RECOGER_CAMPO_COP,
    )
    .map((m) => m.placa);

  useEffect(() => {
    if (vista !== "recoger") return;
    let cancelled = false;
    let enCurso = false;

    const tick = async () => {
      if (cancelled || enCurso) return;
      const placas = placasLiveRef.current;
      if (!placas.length) return;
      enCurso = true;
      try {
        const res = await fetch("/api/placas/recoger-bogota/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placas }),
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;

        const porPlaca = new Map<
          string,
          {
            lat: number | null;
            lng: number | null;
            distancia_km: number | null;
            gps: EstadoGpsPlaca;
            fuentes?: { gps: boolean; airtag: boolean };
            fuente_preferida?: FuenteUbicacion | null;
            fuente_activa?: FuenteUbicacion | null;
            airtag?: {
              visto_en: string | null;
              accuracy_m: number | null;
            } | null;
            gps_pos?: PosicionGpsLive | null;
            airtag_pos?: PosicionAirTagLive | null;
          }
        >();
        for (const p of data.posiciones ?? []) {
          porPlaca.set(String(p.placa).toUpperCase(), p);
        }

        setMotos((prev) =>
          prev.map((m) => {
            const live = porPlaca.get(m.placa.toUpperCase());
            if (!live) return m;

            const sticky = fusionarTelemetriaSticky(
              {
                lat: m.lat,
                lng: m.lng,
                fuente_preferida: m.fuente_preferida,
                fuente_activa: m.fuente_activa,
                fuentes: m.fuentes,
                gps_proveedor: m.gps_proveedor,
              },
              {
                gps_pos: live.gps_pos,
                airtag_pos: live.airtag_pos,
                fuentes: live.fuentes,
                fuente_preferida: live.fuente_preferida,
                fuente_activa: live.fuente_activa,
                lat: live.lat,
                lng: live.lng,
              },
            );

            // Estado GPS: no degradar a "Sin GPS" si la preferida es GPS y
            // el live falló el tick; conservar el estado previo.
            const gpsNext =
              live.gps?.proveedor || live.gps_pos
                ? live.gps
                : sticky.fuente_preferida === "gps"
                  ? m.gps
                  : live.gps ?? m.gps;

            return {
              ...m,
              lat: sticky.lat,
              lng: sticky.lng,
              // La distancia se recalcula en el memo vs origen del operador.
              distancia_km: m.distancia_km,
              gps: gpsNext,
              fuentes: sticky.fuentes,
              fuente_preferida: sticky.fuente_preferida,
              fuente_activa: sticky.fuente_activa,
              airtag:
                live.airtag_pos != null
                  ? {
                      visto_en: live.airtag_pos.visto_en,
                      accuracy_m: live.airtag_pos.accuracy_m,
                    }
                  : live.airtag !== undefined && live.airtag != null
                    ? live.airtag
                    : m.airtag,
              gps_pos: live.gps_pos ?? m.gps_pos,
              airtag_pos: live.airtag_pos ?? m.airtag_pos,
              gps_proveedor: sticky.gps_proveedor,
            };
          }),
        );
        setActualizadoEnVivo(
          new Date().toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        );
      } catch {
        // reintenta
      } finally {
        enCurso = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_GPS_VIVO_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [vista]);

  const { paraRecoger, paraLlamar } = useMemo(() => {
    const recoger: MotoRecogerBogota[] = [];
    const llamar: MotoRecogerBogota[] = [];
    for (const m of motos) {
      const dist =
        m.lat != null && m.lng != null
          ? distanciaKm(origen, { lat: m.lat, lng: m.lng })
          : null;
      const conDist = { ...m, distancia_km: dist };

      const tieneUbicacion = m.lat != null && m.lng != null;
      // Solo señal viva: GPS en línea, o ubicación alternativa (sin última posición GPS offline).
      const gpsEnLinea = Boolean(m.gps.funcional);
      const senalAlterna =
        !gpsEnLinea &&
        (m.fuente_preferida === "airtag" || m.fuente_activa === "airtag") &&
        tieneUbicacion;
      const enLinea = tieneUbicacion && (gpsEnLinea || senalAlterna);

      if (m.origen === "pinilla") {
        recoger.push(conDist);
      } else if (m.deuda_total >= DEUDA_MIN_RECOGER_CAMPO_COP) {
        if (enLinea && dist != null && dist <= DISTANCIA_MAX_RECOGER_KM) {
          recoger.push(conDist);
        }
      } else {
        llamar.push(conDist);
      }
    }
    recoger.sort((a, b) => {
      const da = a.distancia_km ?? Infinity;
      const db = b.distancia_km ?? Infinity;
      if (da !== db) return da - db;
      const score = (m: MotoRecogerBogota) =>
        Number(m.gps.funcional) * 2 + Number(m.fuentes?.airtag);
      return score(b) - score(a);
    });
    return { paraRecoger: recoger, paraLlamar: llamar };
  }, [motos, origen]);

  const listaBase = vista === "recoger" ? paraRecoger : paraLlamar;

  const listaFiltradaGeocerca = useMemo(() => {
    if (!poligonoGeocerca?.length || poligonoGeocerca.length < 3) {
      return listaBase;
    }
    const conCoords = listaBase.filter((m) => m.lat != null && m.lng != null);
    const dentro = filtrarPuntosEnPoligono(
      conCoords.map((m) => ({
        placa: m.placa,
        lat: m.lat!,
        lng: m.lng!,
      })),
      poligonoGeocerca,
    );
    const placasDentro = new Set(dentro.map((p) => p.placa));
    return listaBase.filter((m) => placasDentro.has(m.placa));
  }, [listaBase, poligonoGeocerca]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    const base = listaFiltradaGeocerca;
    if (!q) return base;
    return base.filter(
      (m) =>
        m.placa.toUpperCase().includes(q) ||
        m.nombre.toUpperCase().includes(q) ||
        m.cedula.includes(q) ||
        digitosTelefono(m.telefono).includes(q.replace(/\D/g, "")),
    );
  }, [listaFiltradaGeocerca, busqueda]);

  const deudaLista = lista.reduce((s, m) => s + m.deuda_total, 0);

  const puntosMapa = useMemo(
    () =>
      paraRecoger
        .filter((m) => m.lat != null && m.lng != null)
        .map((m) => ({
          placa: m.placa,
          lat: m.lat!,
          lng: m.lng!,
          deuda_total: m.deuda_total,
          distancia_km: m.distancia_km,
          // Verde si tenemos posición sostenida; no parpadear por offline momentáneo.
          online: true,
        })),
    [paraRecoger],
  );

  const seleccionarPlaca = useCallback((placa: string) => {
    setSeleccionada((prev) => {
      const next = prev === placa ? null : placa;
      setMasAcciones(false);
      return next;
    });
  }, []);

  // Scroll fila seleccionada a la vista
  useEffect(() => {
    if (!seleccionada) return;
    const el = document.querySelector(
      `[data-placa="${CSS.escape(seleccionada)}"]`,
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [seleccionada]);

  const togglePlacaRuta = useCallback((placa: string) => {
    setPlacasSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(placa)) next.delete(placa);
      else next.add(placa);
      return next;
    });
  }, []);

  const agregarVerticeGeocerca = useCallback((punto: PuntoRuta) => {
    setVerticesGeocerca((v) => [...v, punto]);
    setPoligonoGeocerca(null);
    setRutaError(null);
  }, []);

  const toggleGeocerca = useCallback(() => {
    setModoGeocerca((activo) => {
      if (activo && !poligonoGeocerca) setVerticesGeocerca([]);
      return !activo;
    });
  }, [poligonoGeocerca]);

  const cerrarGeocerca = useCallback(() => {
    if (verticesGeocerca.length < 3) return;
    const poligono = [...verticesGeocerca];
    setPoligonoGeocerca(poligono);
    setModoGeocerca(false);

    const puntos = puntosMapa.map((m) => ({
      placa: m.placa,
      lat: m.lat,
      lng: m.lng,
    }));
    const dentro = filtrarPuntosEnPoligono(puntos, poligono).map((p) => p.placa);
    setPlacasSeleccionadas(new Set(dentro));
    if (dentro.length === 0) {
      setRutaError(
        "Zona cerrada. No hay motos dentro — amplía o borra y dibuja de nuevo.",
      );
    } else {
      setRutaError(null);
    }
  }, [verticesGeocerca, puntosMapa]);

  const limpiarGeocerca = useCallback(() => {
    setVerticesGeocerca([]);
    setPoligonoGeocerca(null);
    setModoGeocerca(false);
    setPlacasSeleccionadas(new Set());
    setRutaPolyline([]);
    setRutaError(null);
  }, []);

  const placasEnPoligono = useMemo(() => {
    if (!poligonoGeocerca || poligonoGeocerca.length < 3) return [] as string[];
    const puntos = puntosMapa.map((m) => ({
      placa: m.placa,
      lat: m.lat,
      lng: m.lng,
    }));
    return filtrarPuntosEnPoligono(puntos, poligonoGeocerca).map((p) => p.placa);
  }, [puntosMapa, poligonoGeocerca]);

  useEffect(() => {
    if (!poligonoGeocerca || poligonoGeocerca.length < 3) return;
    setPlacasSeleccionadas(new Set(placasEnPoligono));
  }, [poligonoGeocerca, placasEnPoligono]);

  const crearRuta = useCallback(async () => {
    const seleccionadas = paraRecoger.filter(
      (m) =>
        placasSeleccionadas.has(m.placa) &&
        m.lat != null &&
        m.lng != null,
    );
    if (seleccionadas.length === 0) {
      setRutaError("Marca al menos una placa con GPS.");
      return;
    }

    setGenerandoRuta(true);
    setRutaError(null);
    try {
      const paradasRaw = seleccionadas.map((m) => ({
        id: m.placa,
        lat: m.lat!,
        lng: m.lng!,
      }));

      const ordenadas = await optimizarOrdenParadasOsrm(origen, paradasRaw);
      const paradas: ParadaRuta[] = ordenadas.map((p) => {
        const m = seleccionadas.find((x) => x.placa === p.id)!;
        return {
          placa: m.placa,
          nombre: m.nombre,
          deuda_total: m.deuda_total,
          lat: p.lat,
          lng: p.lng,
        };
      });

      const rutaGeom = await obtenerRutaCompleta(origen, paradas);
      setRutaPolyline(rutaGeom.puntos);

      const ruta: RutaCompartida = {
        titulo: `Modo Recogida · ${paradas.length} motos`,
        origen,
        paradas,
        creada_en: new Date().toISOString(),
        modo_recogida: true,
      };

      const url = enlaceRutaCompartida(ruta);
      try {
        if (typeof navigator.share === "function") {
          await navigator.share({
            title: "Modo Recogida",
            text: `${paradas.length} motos · abre el link en el celular del recolector`,
            url,
          });
        } else {
          await navigator.clipboard.writeText(url);
          setRutaLinkCopiado(true);
          window.setTimeout(() => setRutaLinkCopiado(false), 2500);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          window.open(url, "_blank");
          return;
        }
        window.open(url, "_blank");
      }
    } catch {
      setRutaError("No se pudo crear la ruta. Reintenta.");
    } finally {
      setGenerandoRuta(false);
    }
  }, [origen, paraRecoger, placasSeleccionadas]);

  const copiarAviso = useCallback(async (m: MotoRecogerBogota) => {
    const texto = mensajeAvisoUrgente(m.nombre, m.deuda_total);
    try {
      await navigator.clipboard.writeText(texto);
      setAvisoCopiado(m.placa);
      window.setTimeout(() => {
        setAvisoCopiado((prev) => (prev === m.placa ? null : prev));
      }, 2000);
    } catch {
      window.prompt("Copia este mensaje:", texto);
    }
  }, []);

  const compartirSeguimiento = useCallback(async (placa: string) => {
    const url = enlaceSeguirPlaca(placa);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: `Seguir ${placa}`,
          text: `Sigue la placa ${placa} en vivo`,
          url,
        });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiado(placa);
      window.setTimeout(() => {
        setLinkCopiado((prev) => (prev === placa ? null : prev));
      }, 2000);
    } catch {
      window.prompt("Copia este link:", url);
    }
  }, []);

  const motoSeleccionada = seleccionada
    ? lista.find((m) => m.placa === seleccionada) ?? null
    : null;

  const panelListaProps = {
    lista,
    loading,
    modo: vista,
    seleccionada,
    onSeleccionar: seleccionarPlaca,
    avisoCopiado,
    linkCopiado,
    onCopiarAviso: copiarAviso,
    onCompartirSeguimiento: compartirSeguimiento,
    modoRuta: vista === "recoger" && placasSeleccionadas.size > 0,
    placasSeleccionadas,
    onToggleRuta: togglePlacaRuta,
  };

  const mapaProps = {
    motos: puntosMapa,
    origen,
    radioKm: DISTANCIA_MAX_RECOGER_KM,
    seleccionada,
    onSeleccionar: seleccionarPlaca,
    embebido: esDesktop && !mapaFullscreen,
    modoGeocerca,
    verticesGeocerca,
    poligonoGeocerca,
    onClickGeocerca: agregarVerticeGeocerca,
    placasSeleccionadas,
    rutaPolyline,
    onToggleGeocerca: vista === "recoger" ? toggleGeocerca : undefined,
    onCerrarGeocerca: vista === "recoger" ? cerrarGeocerca : undefined,
    onLimpiarGeocerca: vista === "recoger" ? limpiarGeocerca : undefined,
    onGenerarRuta: vista === "recoger" ? () => void crearRuta() : undefined,
    generandoRuta,
    placasEnRutaCount: placasSeleccionadas.size,
    puedeGenerarRuta:
      vista === "recoger" &&
      Boolean(poligonoGeocerca && poligonoGeocerca.length >= 3),
  };

  const geomallaCerrada =
    vista === "recoger" &&
    Boolean(poligonoGeocerca && poligonoGeocerca.length >= 3);

  const padListaSeleccion =
    motoSeleccionada && !esDesktop
      ? masAcciones
        ? "pb-[calc(11rem+env(safe-area-inset-bottom))]"
        : "pb-[calc(8rem+env(safe-area-inset-bottom))]"
      : "pb-[calc(5.5rem+env(safe-area-inset-bottom))]";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/95 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-[414px] flex-col gap-2.5 lg:max-w-none">
          {/* Desktop: título + actualizar */}
          <div className="hidden items-start justify-between gap-3 lg:flex">
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight">Bogotá</h1>
              <p className="mt-0.5 text-xs text-pretty text-muted-foreground">
                Recoger cerca · Llamar deuda menor
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 rounded-lg"
              disabled={loading}
              aria-label="Actualizar lista"
              onClick={() => {
                setLoading(true);
                void cargar(true).finally(() => setLoading(false));
              }}
            >
              <RefreshCwIcon className="size-4" aria-hidden />
              <span className="ml-1.5">{loading ? "…" : "Actualizar"}</span>
            </Button>
          </div>

          {/* Tabs: botones con aria */}
          <div
            role="tablist"
            aria-label="Tipo de lista"
            className="grid h-12 w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          >
            <button
              type="button"
              role="tab"
              id="tab-recoger"
              aria-selected={vista === "recoger"}
              aria-controls="panel-bogota"
              className={cn(
                "flex h-10 flex-col items-center justify-center rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                vista === "recoger"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => setVista("recoger")}
            >
              <span>Recoger</span>
              <span className="text-xs font-medium tabular-nums opacity-80">
                {paraRecoger.length} motos
              </span>
            </button>
            <button
              type="button"
              role="tab"
              id="tab-llamar"
              aria-selected={vista === "llamar"}
              aria-controls="panel-bogota"
              className={cn(
                "flex h-10 flex-col items-center justify-center rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                vista === "llamar"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => setVista("llamar")}
            >
              <span>Llamar</span>
              <span className="text-xs font-medium tabular-nums opacity-80">
                {paraLlamar.length} motos
              </span>
            </button>
          </div>

          {/* Móvil: Mi ubicación + actualizar */}
          {vista === "recoger" ? (
            <div className="flex gap-2 lg:hidden">
              <Button
                type="button"
                variant="secondary"
                className="h-11 flex-1 rounded-lg text-base font-semibold"
                disabled={gpsOrigenCargando}
                onClick={() => void usarMiGpsOrigen()}
              >
                <CrosshairIcon className="mr-1.5 size-4" aria-hidden />
                {gpsOrigenCargando ? "Buscando…" : "Mi ubicación"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 rounded-lg"
                disabled={loading}
                aria-label="Actualizar lista"
                onClick={() => {
                  setLoading(true);
                  void cargar(true).finally(() => setLoading(false));
                }}
              >
                <RefreshCwIcon className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}

          {/* Desktop: ubicación con coords opcionales */}
          {vista === "recoger" && esDesktop ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 flex-1 rounded-lg"
                  disabled={gpsOrigenCargando}
                  onClick={() => void usarMiGpsOrigen()}
                >
                  <CrosshairIcon className="mr-1.5 size-4" aria-hidden />
                  {gpsOrigenCargando ? "Obteniendo GPS…" : "Mi ubicación"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 shrink-0 rounded-lg text-xs"
                  onClick={() => setMostrarCoords((v) => !v)}
                >
                  {mostrarCoords ? "Ocultar punto" : "Cambiar punto"}
                </Button>
              </div>
              {mostrarCoords ? (
                <form
                  className="flex flex-col gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    aplicarOrigen();
                  }}
                >
                  <Label htmlFor="origen-coords" className="text-xs">
                    Coordenadas (radio {DISTANCIA_MAX_RECOGER_KM} km)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="origen-coords"
                      type="text"
                      inputMode="decimal"
                      value={coordsInput}
                      onChange={(e) => {
                        setCoordsInput(e.target.value);
                        setOrigenError(null);
                      }}
                      placeholder="4.66, -74.06"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-11 flex-1 text-base tabular-nums"
                    />
                    <Button type="submit" className="h-11 shrink-0 rounded-lg">
                      Aplicar
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}

          {origenError ? (
            <p className="text-xs text-destructive" role="alert">
              {origenError}
            </p>
          ) : null}

          <div>
            <Label htmlFor="buscar-bogota" className="sr-only">
              Buscar placa o nombre
            </Label>
            <Input
              id="buscar-bogota"
              type="search"
              placeholder="Placa o nombre"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="h-11 rounded-lg text-base"
            />
          </div>

          {!loading && lista.length > 0 ? (
            <p className="text-xs tabular-nums text-muted-foreground" role="status">
              {lista.length} moto{lista.length === 1 ? "" : "s"} ·{" "}
              {formatearCOP(deudaLista)}
              {poligonoGeocerca ? ` · ${placasSeleccionadas.size} en zona` : ""}
              {actualizadoEnVivo && vista === "recoger" && esDesktop
                ? ` · en vivo ${actualizadoEnVivo}`
                : null}
            </p>
          ) : null}

          {rutaError ? (
            <p className="text-xs text-destructive" role="alert">
              {rutaError}
            </p>
          ) : null}
          {rutaLinkCopiado ? (
            <p className="text-xs text-success" role="status">
              Link de ruta copiado — envíalo al recolector.
            </p>
          ) : null}
        </div>
      </header>

      {geomallaCerrada ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[60] border-t border-rose-800/70 bg-rose-950/95 px-3 py-2.5 shadow-[0_-4px_24px_rgba(0,0,0,.45)] backdrop-blur-md sm:px-4"
          role="region"
          aria-label="Compartir ruta de recogida"
        >
          <div className="pointer-events-auto mx-auto flex w-full max-w-[480px] flex-col gap-1.5">
            <p className="text-center text-xs tabular-nums text-rose-200/90">
              Zona · {placasSeleccionadas.size} moto
              {placasSeleccionadas.size === 1 ? "" : "s"}
            </p>
            <Button
              type="button"
              className="h-12 w-full rounded-xl bg-rose-600 text-base font-bold shadow-lg hover:bg-rose-500"
              disabled={placasSeleccionadas.size === 0 || generandoRuta}
              onClick={() => void crearRuta()}
            >
              <RouteIcon className="mr-2 size-5" aria-hidden />
              {generandoRuta
                ? "Generando ruta…"
                : placasSeleccionadas.size === 0
                  ? "Sin motos en la zona"
                  : rutaLinkCopiado
                    ? "Link copiado — compártelo"
                    : `Compartir ruta · ${placasSeleccionadas.size} moto${placasSeleccionadas.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      ) : null}

      <main
        id="panel-bogota"
        role="tabpanel"
        aria-labelledby={vista === "recoger" ? "tab-recoger" : "tab-llamar"}
        className={cn(
          "mx-auto flex min-h-0 w-full max-w-[414px] flex-1 flex-col overflow-hidden px-3 pt-2 lg:max-w-none lg:px-6",
          geomallaCerrada && "pb-24",
        )}
      >
        {error ? (
          <Alert variant="destructive" className="mb-3 shrink-0">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {motoSeleccionada ? (
          <p className="sr-only" role="status" aria-live="polite">
            {motoSeleccionada.placa} seleccionada, debe{" "}
            {formatearCOP(motoSeleccionada.deuda_total)}
          </p>
        ) : null}

        {esDesktop && vista === "recoger" ? (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
              <div className="relative min-h-0 min-w-0 flex-1">
                <MapaRecogerBogota
                  {...mapaProps}
                  fullscreen={mapaFullscreen}
                  onToggleFullscreen={() => {
                    setMapaFullscreen((v) => {
                      if (!v) setListaOverlay(true);
                      return !v;
                    });
                  }}
                  className={cn(
                    mapaFullscreen &&
                      listaOverlay &&
                      "lg:pr-[min(420px,38%)]",
                  )}
                />
              </div>
              {!mapaFullscreen ? (
                <aside
                  className="flex w-[min(420px,38%)] shrink-0 flex-col overflow-hidden border-l border-border bg-card/50"
                  aria-label="Clientes en mapa"
                >
                  <div className="shrink-0 border-b border-border px-3 py-2.5">
                    <p className="text-sm font-semibold">
                      {lista.length} cliente{lista.length === 1 ? "" : "s"}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-destructive">
                      {formatearCOP(deudaLista)}
                    </p>
                  </div>
                  {geomallaCerrada ? (
                    <div className="shrink-0 border-b border-rose-900/40 bg-rose-950/40 px-3 py-2.5">
                      <Button
                        type="button"
                        className="h-11 w-full rounded-lg bg-rose-600 font-semibold hover:bg-rose-500"
                        disabled={
                          placasSeleccionadas.size === 0 || generandoRuta
                        }
                        onClick={() => void crearRuta()}
                      >
                        <RouteIcon className="mr-2 size-4" aria-hidden />
                        {generandoRuta
                          ? "Generando…"
                          : `Compartir ruta · ${placasSeleccionadas.size}`}
                      </Button>
                    </div>
                  ) : null}
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    <PanelLista {...panelListaProps} />
                  </div>
                </aside>
              ) : null}
            </div>
          </div>
        ) : null}

        {mapaFullscreen && listaOverlay && vista === "recoger" ? (
          <aside
            className="fixed right-0 top-14 z-[60] flex h-[calc(100dvh-3.5rem)] w-[min(420px,92vw)] flex-col overflow-hidden border-l border-border bg-card/95 shadow-xl backdrop-blur-md"
            aria-label="Lista en mapa pantalla completa"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold">
                  {lista.length} cliente{lista.length === 1 ? "" : "s"}
                </p>
                <p className="text-lg font-bold tabular-nums text-destructive">
                  {formatearCOP(deudaLista)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => setListaOverlay(false)}
              >
                Ocultar
              </Button>
            </div>
            {geomallaCerrada ? (
              <div className="shrink-0 border-b border-rose-900/40 bg-rose-950/40 px-3 py-2.5">
                <Button
                  type="button"
                  className="h-11 w-full rounded-lg bg-rose-600 font-semibold hover:bg-rose-500"
                  disabled={placasSeleccionadas.size === 0 || generandoRuta}
                  onClick={() => void crearRuta()}
                >
                  <RouteIcon className="mr-2 size-4" aria-hidden />
                  {generandoRuta
                    ? "Generando…"
                    : `Compartir ruta · ${placasSeleccionadas.size}`}
                </Button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <PanelLista {...panelListaProps} />
            </div>
          </aside>
        ) : null}
        {mapaFullscreen && !listaOverlay && vista === "recoger" ? (
          <Button
            type="button"
            className="fixed right-4 top-16 z-[60] h-11 shadow-lg"
            onClick={() => setListaOverlay(true)}
          >
            Ver lista ({lista.length})
          </Button>
        ) : null}

        {/* Mobile: mapa fijo + lista scrollea */}
        {!esDesktop && vista === "recoger" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <MapaRecogerBogota
              {...mapaProps}
              fullscreen={mapaFullscreen}
              onToggleFullscreen={() => {
                setMapaFullscreen((v) => {
                  if (!v) setListaOverlay(true);
                  return !v;
                });
              }}
            />
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y",
                padListaSeleccion,
              )}
              data-scroll-main
            >
              <PanelLista {...panelListaProps} compacta />
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-hidden",
            vista === "recoger" ? "hidden" : "flex flex-col",
          )}
        >
          {vista === "llamar" ? (
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y",
                padListaSeleccion,
              )}
              data-scroll-main
            >
              <PanelLista {...panelListaProps} />
            </div>
          ) : null}
        </div>

        {/* Barra fija móvil al seleccionar (Recoger) — compacta + Cerrar */}
        {motoSeleccionada && !esDesktop && vista === "recoger" ? (
          <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[414px] px-3">
            <div className="rounded-xl border border-border bg-background/95 p-2.5 shadow-lg backdrop-blur">
              <div className="mb-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-bold tabular-nums">
                  {motoSeleccionada.placa}{" "}
                  <span className="text-destructive">
                    {formatearCOP(motoSeleccionada.deuda_total)}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 shrink-0 rounded-lg px-3 text-sm font-semibold"
                  aria-label="Cerrar y ver la lista"
                  onClick={() => {
                    setSeleccionada(null);
                    setMasAcciones(false);
                  }}
                >
                  <XIcon className="mr-1 size-4" aria-hidden />
                  Cerrar
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                {motoSeleccionada.lat != null && motoSeleccionada.lng != null ? (
                  <Button
                    type="button"
                    className="h-11 text-base font-bold"
                    asChild
                  >
                    <a
                      href={enlaceMaps(
                        motoSeleccionada.lat,
                        motoSeleccionada.lng,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <NavigationIcon className="mr-1.5 size-4" aria-hidden />
                      Ir
                    </a>
                  </Button>
                ) : (
                  <Button type="button" className="h-11 text-base font-bold" disabled>
                    Sin ubicación
                  </Button>
                )}
                {motoSeleccionada.lat != null && motoSeleccionada.lng != null ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 text-base font-bold"
                    aria-label={`Compartir seguimiento ${motoSeleccionada.placa}`}
                    onClick={() => void compartirSeguimiento(motoSeleccionada.placa)}
                  >
                    <Share2Icon className="mr-1.5 size-4" aria-hidden />
                    {linkCopiado === motoSeleccionada.placa
                      ? "Copiado"
                      : "Compartir"}
                  </Button>
                ) : enlaceTel(motoSeleccionada.telefono) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 text-base font-bold"
                    asChild
                  >
                    <a href={enlaceTel(motoSeleccionada.telefono)!}>
                      <PhoneIcon className="mr-1.5 size-4" aria-hidden />
                      Llamar
                    </a>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 text-base font-bold"
                    onClick={() => void copiarAviso(motoSeleccionada)}
                  >
                    Aviso
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 min-w-[44px] rounded-lg px-3"
                  aria-expanded={masAcciones}
                  aria-controls="recoger-mas-acciones-movil"
                  aria-label={masAcciones ? "Ocultar más acciones" : "Más acciones"}
                  onClick={() => setMasAcciones((v) => !v)}
                >
                  <MoreHorizontalIcon className="size-5" aria-hidden />
                </Button>
              </div>
              {masAcciones ? (
                <div
                  id="recoger-mas-acciones-movil"
                  className="mt-2 grid grid-cols-2 gap-2"
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 min-h-[44px]"
                    onClick={() => void copiarAviso(motoSeleccionada)}
                  >
                    {avisoCopiado === motoSeleccionada.placa
                      ? "Copiado"
                      : "Copiar aviso"}
                  </Button>
                  {enlaceTel(motoSeleccionada.telefono) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 min-h-[44px]"
                      asChild
                    >
                      <a href={enlaceTel(motoSeleccionada.telefono)!}>
                        <PhoneIcon className="mr-1.5 size-4" aria-hidden />
                        Llamar
                      </a>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 min-h-[44px]"
                      asChild
                    >
                      <a
                        href={enlaceSeguirPlaca(motoSeleccionada.placa)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Ver en vivo
                      </a>
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
