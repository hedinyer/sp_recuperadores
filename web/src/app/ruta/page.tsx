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
  obtenerGpsPreciso,
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
  const [gpsCargando, setGpsCargando] = useState(false);
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

  const activarGps = useCallback(async () => {
    setGpsError(null);
    setGpsCargando(true);
    const res = await obtenerGpsPreciso({ samples: 2, maxWaitMs: 25_000 });
    setGpsCargando(false);
    if (!res.ok) {
      setGpsError(mensajeErrorGps(res.motivo));
      return;
    }
    setYo(res.gps);
    setRecogidaActiva(true);
  }, []);

  useEffect(() => {
    void activarGps();
  }, [activarGps]);

  useEffect(() => {
    if (!recogidaActiva) return;
    const stop = vigilarGps(
      (gps) => {
        setYo(gps);
        setGpsError(null);
      },
      (motivo: MotivoGpsError) => setGpsError(mensajeErrorGps(motivo)),
    );
    return stop;
  }, [recogidaActiva]);

  const paradasOrdenadas = paradasLive.length
    ? paradasLive
    : (rutaData?.paradas ?? []);
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
      : destinoTramo
        ? enlaceGoogleMapsRuta(rutaData!.origen, destinoTramo)
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

  const eta =
    rutaTramo && paradaSiguiente
      ? `${formatearDistanciaRuta(rutaTramo.distancia_m)} · ${formatearDuracionRuta(rutaTramo.duracion_s)}`
      : cargandoRuta
        ? "Calculando ruta…"
        : null;

  return (
    <div className="mx-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-[414px] flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Cabecera compacta */}
      <header className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              recogidaActiva ? "bg-rose-600 text-white" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            <RadioIcon
              className={`size-3 ${recogidaActiva ? "animate-pulse" : ""}`}
              aria-hidden
            />
            Recogida
          </span>
          <span className="text-xs tabular-nums text-zinc-400">
            {paradaActual}/{paradasOrdenadas.length}
          </span>
        </div>
        {!terminada && paradaSiguiente ? (
          <p className="mt-1 truncate text-sm font-semibold text-white">
            → {paradaSiguiente.placa}
            {eta ? (
              <span className="ml-1.5 font-normal text-zinc-400">{eta}</span>
            ) : null}
          </p>
        ) : null}
        <div
          className="mt-1.5 h-1 rounded-full bg-zinc-800"
          role="progressbar"
          aria-valuenow={progreso}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-rose-500"
            style={{ width: `${progreso}%` }}
          />
        </div>
      </header>

      {/* Mapa: mitad superior, altura fija en móvil */}
      <div className="relative min-h-[42dvh] flex-1 bg-zinc-900">
        <MapaConducirRuta
          yo={yoPunto}
          paradas={paradasMapa}
          paradaActual={paradaActual}
          rutaCompleta={rutaCompleta?.puntos ?? []}
          rutaTramo={rutaTramo?.puntos ?? []}
          seguirYo={recogidaActiva}
        />
      </div>

      {/* Comandos: siempre visibles abajo */}
      <footer className="shrink-0 space-y-2 border-t border-zinc-800 bg-zinc-950 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {gpsError ? (
          <p className="text-center text-xs text-rose-400" role="alert">
            {gpsError}
          </p>
        ) : null}

        {!recogidaActiva ? (
          <>
            <p className="text-center text-sm text-zinc-400">
              {paradasOrdenadas.length} motos · toca para activar GPS
            </p>
            <Button
              type="button"
              className="h-14 w-full rounded-xl bg-rose-600 text-base font-bold"
              disabled={gpsCargando}
              onClick={() => void activarGps()}
            >
              {gpsCargando ? "Obteniendo GPS…" : "Activar GPS e iniciar"}
            </Button>
          </>
        ) : terminada ? (
          <Button type="button" variant="secondary" className="h-14 w-full" asChild>
            <Link href="/recoger-bogota">Listo — volver a Bogotá</Link>
          </Button>
        ) : paradaSiguiente ? (
          <>
            <div className="rounded-lg bg-zinc-900 px-3 py-2">
              <p className="text-xs text-zinc-500">
                Parada {paradaActual + 1} de {paradasOrdenadas.length}
              </p>
              <p className="text-lg font-bold tracking-wide">
                {paradaSiguiente.placa}
              </p>
              <p className="truncate text-sm text-zinc-400">
                {paradaSiguiente.nombre}
              </p>
              <p className="text-base font-bold tabular-nums text-rose-400">
                {formatearCOP(paradaSiguiente.deuda_total)}
              </p>
            </div>

            <Button
              type="button"
              className="h-14 w-full rounded-xl bg-emerald-700 text-base font-bold hover:bg-emerald-600"
              disabled={!mapsHref}
              asChild={Boolean(mapsHref)}
            >
              {mapsHref ? (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                  <NavigationIcon className="mr-2 inline size-5" aria-hidden />
                  Ir en Google Maps
                </a>
              ) : (
                <span>Esperando GPS…</span>
              )}
            </Button>

            <Button
              type="button"
              className="h-14 w-full rounded-xl bg-rose-600 text-base font-bold"
              onClick={marcarLlegada}
            >
              <CheckIcon className="mr-2 inline size-5" aria-hidden />
              {cercaDeParada ? "Llegué — siguiente moto" : "Siguiente moto"}
            </Button>
          </>
        ) : null}
      </footer>
    </div>
  );
}
