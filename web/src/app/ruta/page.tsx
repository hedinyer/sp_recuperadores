"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckIcon, NavigationIcon, RadioIcon } from "lucide-react";

import { MapaConducirRuta } from "@/components/MapaConducirRuta";
import { Button } from "@/components/ui/button";
import {
  enlaceGoogleMapsRuta,
  mensajeErrorGps,
  vigilarGps,
  type GpsPreciso,
  type MotivoGpsError,
} from "@/lib/geolocation";
import { formatearCOP } from "@/lib/formatoDinero";
import {
  decodificarRuta,
  type ParadaRuta,
  type RutaCompartida,
} from "@/lib/rutaCompartida";
import { obtenerRutaCompleta } from "@/lib/rutaMultiParada";
import {
  convieneRecalcularRuta,
  formatearDistanciaRuta,
  formatearDuracionRuta,
  obtenerRutaConduccion,
  type PuntoRuta,
  type RutaConduccion,
} from "@/lib/rutaOsrm";

const LLEGADA_METROS = 80;
const POLL_MOTOS_MS = 3_000;

function distMetros(a: PuntoRuta, b: PuntoRuta): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function RutaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">
          Cargando…
        </div>
      }
    >
      <RutaPageContenido />
    </Suspense>
  );
}

function RutaPageContenido() {
  const searchParams = useSearchParams();
  const qRaw = searchParams.get("q") ?? "";

  const [rutaData, setRutaData] = useState<RutaCompartida | null>(null);
  const [parseError, setParseError] = useState(false);
  const [paradasLive, setParadasLive] = useState<ParadaRuta[]>([]);

  const [yo, setYo] = useState<GpsPreciso | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [recogidaActiva, setRecogidaActiva] = useState(false);

  const [paradaActual, setParadaActual] = useState(0);
  const [rutaCompleta, setRutaCompleta] = useState<RutaConduccion | null>(null);
  const [rutaTramo, setRutaTramo] = useState<RutaConduccion | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);

  const tramoOrigenRef = useRef<PuntoRuta | null>(null);
  const tramoDestinoRef = useRef<PuntoRuta | null>(null);
  const abortTramoRef = useRef<AbortController | null>(null);

  useEffect(() => {
    document.title = "Modo Recogida";
  }, []);

  useEffect(() => {
    const decoded = decodificarRuta(qRaw);
    if (!decoded?.paradas?.length) {
      setParseError(true);
      setRutaData(null);
      setParadasLive([]);
    } else {
      setParseError(false);
      setRutaData(decoded);
      setParadasLive(decoded.paradas);
    }
  }, [qRaw]);

  useEffect(() => {
    const stop = vigilarGps(
      (gps) => {
        setYo(gps);
        setGpsError(null);
        setRecogidaActiva(true);
      },
      (motivo: MotivoGpsError) => setGpsError(mensajeErrorGps(motivo)),
    );
    return stop;
  }, []);

  const paradasOrdenadas = paradasLive.length ? paradasLive : (rutaData?.paradas ?? []);
  const paradaSiguiente = paradasOrdenadas[paradaActual] ?? null;
  const destinoTramo = paradaSiguiente
    ? { lat: paradaSiguiente.lat, lng: paradaSiguiente.lng }
    : null;

  const yoPunto = useMemo<PuntoRuta | null>(
    () => (yo ? { lat: yo.lat, lng: yo.lng } : null),
    [yo],
  );

  const placasLiveRef = useRef<string[]>([]);
  placasLiveRef.current = paradasOrdenadas
    .slice(paradaActual)
    .map((p) => p.placa);

  useEffect(() => {
    if (!rutaData?.paradas.length) return;
    let cancelado = false;
    let enCurso = false;

    const tick = async () => {
      if (cancelado || enCurso) return;
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
        if (!res.ok || cancelado) return;

        const porPlaca = new Map<
          string,
          { lat: number | null; lng: number | null }
        >();
        for (const p of data.posiciones ?? []) {
          porPlaca.set(String(p.placa).toUpperCase(), {
            lat: p.lat ?? null,
            lng: p.lng ?? null,
          });
        }

        setParadasLive((prev) =>
          prev.map((m) => {
            const live = porPlaca.get(m.placa.toUpperCase());
            if (!live?.lat || !live?.lng) return m;
            return { ...m, lat: live.lat, lng: live.lng };
          }),
        );
      } catch {
        // reintenta
      } finally {
        enCurso = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MOTOS_MS);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [rutaData, paradaActual]);

  useEffect(() => {
    if (!rutaData?.paradas.length) {
      setRutaCompleta(null);
      return;
    }
    const pendientes = paradasOrdenadas.slice(paradaActual);
    if (!pendientes.length) {
      setRutaCompleta(null);
      return;
    }
    let cancelado = false;
    setCargandoRuta(true);
    const origenCalc = yoPunto ?? rutaData.origen;
    const ac = new AbortController();
    void obtenerRutaCompleta(origenCalc, pendientes, ac.signal)
      .then((r) => {
        if (!cancelado) setRutaCompleta(r);
      })
      .finally(() => {
        if (!cancelado) setCargandoRuta(false);
      });
    return () => {
      cancelado = true;
      ac.abort();
    };
  }, [rutaData, yoPunto, paradaActual, paradasOrdenadas]);

  useEffect(() => {
    if (!recogidaActiva || !yoPunto || !destinoTramo) return;
    if (
      !convieneRecalcularRuta(
        tramoOrigenRef.current,
        tramoDestinoRef.current,
        yoPunto,
        destinoTramo,
      )
    ) {
      return;
    }
    abortTramoRef.current?.abort();
    const ac = new AbortController();
    abortTramoRef.current = ac;
    void obtenerRutaConduccion(yoPunto, destinoTramo, ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      setRutaTramo(r);
      tramoOrigenRef.current = yoPunto;
      tramoDestinoRef.current = destinoTramo;
    });
    return () => ac.abort();
  }, [recogidaActiva, yoPunto, destinoTramo]);

  const distanciaAParada =
    yoPunto && destinoTramo ? distMetros(yoPunto, destinoTramo) : null;
  const cercaDeParada =
    distanciaAParada != null && distanciaAParada <= LLEGADA_METROS;

  const marcarLlegada = useCallback(() => {
    setParadaActual((i) => Math.min(i + 1, paradasOrdenadas.length));
    tramoOrigenRef.current = null;
    tramoDestinoRef.current = null;
  }, [paradasOrdenadas.length]);

  const mapsHref =
    yoPunto && destinoTramo
      ? enlaceGoogleMapsRuta(yoPunto, destinoTramo)
      : null;

  const paradasMapa = paradasOrdenadas.map((p, i) => ({
    placa: p.placa,
    lat: p.lat,
    lng: p.lng,
    indice: i + 1,
  }));

  if (parseError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center text-zinc-300">
        <p>Link no válido.</p>
        <Button asChild variant="secondary">
          <Link href="/recoger-bogota">Ir a Bogotá</Link>
        </Button>
      </div>
    );
  }

  if (!rutaData) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">
        Cargando ruta…
      </div>
    );
  }

  const terminada = paradaActual >= paradasOrdenadas.length;
  const progreso = paradasOrdenadas.length
    ? Math.round((paradaActual / paradasOrdenadas.length) * 100)
    : 0;

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[414px] flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Mapa a pantalla completa detrás */}
      <div className="absolute inset-0">
        <MapaConducirRuta
          yo={yoPunto}
          paradas={paradasMapa}
          paradaActual={paradaActual}
          rutaCompleta={rutaCompleta?.puntos ?? []}
          rutaTramo={rutaTramo?.puntos ?? []}
          seguirYo={recogidaActiva}
        />
      </div>

      {/* Barra superior */}
      <header className="relative z-10 shrink-0 bg-gradient-to-b from-zinc-950/95 to-transparent px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              recogidaActiva
                ? "bg-rose-600 text-white"
                : "bg-zinc-800/90 text-zinc-300"
            }`}
          >
            <RadioIcon
              className={`size-3.5 ${recogidaActiva ? "animate-pulse" : ""}`}
              aria-hidden
            />
            Modo Recogida
          </span>
          <span className="text-xs tabular-nums text-zinc-300">
            {paradaActual}/{paradasOrdenadas.length}
          </span>
        </div>
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800/80"
          role="progressbar"
          aria-valuenow={progreso}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-rose-500 transition-all"
            style={{ width: `${progreso}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] tabular-nums text-zinc-300" role="status">
          {terminada
            ? "Ruta completada"
            : !recogidaActiva
              ? "Activa el GPS del iPhone para empezar"
              : rutaTramo
                ? `${formatearDistanciaRuta(rutaTramo.distancia_m)} · ${formatearDuracionRuta(rutaTramo.duracion_s)} a ${paradaSiguiente?.placa}`
                : cargandoRuta
                  ? "Calculando ruta…"
                  : "Ubicando…"}
        </p>
      </header>

      {/* Espaciador: el mapa se ve en el centro */}
      <div className="relative z-0 min-h-0 flex-1" aria-hidden />

      {/* Panel inferior tipo Uber */}
      <div className="relative z-10 shrink-0 rounded-t-2xl border-t border-zinc-700/80 bg-zinc-950/95 px-4 pt-3 shadow-[0_-8px_32px_rgba(0,0,0,.5)] backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {!recogidaActiva ? (
          <div className="space-y-3 py-1">
            <p className="text-center text-sm text-zinc-300">
              {paradasOrdenadas.length} motos en ruta. Permite la ubicación para
              ver dónde estás y seguir la ruta en vivo.
            </p>
            <Button
              type="button"
              className="h-12 w-full rounded-xl bg-rose-600 text-base font-bold hover:bg-rose-500"
              onClick={() => {
                /* vigilarGps ya activo; reintento implícito al tocar */
                setGpsError(null);
              }}
            >
              Activar GPS e iniciar
            </Button>
            {gpsError ? (
              <p className="text-center text-xs text-rose-400" role="alert">
                {gpsError}
              </p>
            ) : null}
          </div>
        ) : terminada ? (
          <div className="space-y-3 py-2">
            <p className="text-center text-base font-semibold text-white">
              Recogida completada
            </p>
            <Button type="button" variant="secondary" className="h-12 w-full" asChild>
              <Link href="/recoger-bogota">Volver a Bogotá</Link>
            </Button>
          </div>
        ) : paradaSiguiente ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-zinc-500">
                Siguiente · parada {paradaActual + 1}
              </p>
              <p className="text-xl font-bold tracking-wide text-white">
                {paradaSiguiente.placa}
              </p>
              <p className="truncate text-sm text-zinc-400">
                {paradaSiguiente.nombre}
              </p>
              <p className="text-lg font-bold tabular-nums text-rose-400">
                {formatearCOP(paradaSiguiente.deuda_total)}
              </p>
              {distanciaAParada != null ? (
                <p className="text-xs tabular-nums text-zinc-500">
                  ~{Math.round(distanciaAParada)} m en línea recta
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2">
              {mapsHref ? (
                <Button
                  type="button"
                  className="h-12 w-full rounded-xl bg-emerald-700 text-base font-semibold hover:bg-emerald-600"
                  asChild
                >
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <NavigationIcon className="mr-2 size-5" aria-hidden />
                    Navegar en Maps
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                className="h-12 w-full rounded-xl bg-rose-600 text-base font-bold hover:bg-rose-500"
                onClick={marcarLlegada}
              >
                <CheckIcon className="mr-2 size-5" aria-hidden />
                {cercaDeParada ? "Llegué — siguiente" : "Moto recogida — siguiente"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
