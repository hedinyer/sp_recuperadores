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
import {
  CheckIcon,
  CopyIcon,
  MapPinIcon,
  NavigationIcon,
  RadioIcon,
  Share2Icon,
} from "lucide-react";

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
  enlaceRutaCompartida,
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
          Cargando Modo Recogida…
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

  const [yo, setYo] = useState<GpsPreciso | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsActivo, setGpsActivo] = useState(true);
  const [recogidaActiva, setRecogidaActiva] = useState(false);

  const [paradaActual, setParadaActual] = useState(0);
  const [rutaCompleta, setRutaCompleta] = useState<RutaConduccion | null>(null);
  const [rutaTramo, setRutaTramo] = useState<RutaConduccion | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);

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
    } else {
      setParseError(false);
      setRutaData(decoded);
    }
  }, [qRaw]);

  useEffect(() => {
    setGpsActivo(true);
  }, []);

  useEffect(() => {
    if (!gpsActivo) return;
    const stop = vigilarGps(
      (gps) => {
        setYo(gps);
        setGpsError(null);
        setRecogidaActiva(true);
      },
      (motivo: MotivoGpsError) => setGpsError(mensajeErrorGps(motivo)),
    );
    return stop;
  }, [gpsActivo]);

  const yoPunto = useMemo<PuntoRuta | null>(
    () => (yo ? { lat: yo.lat, lng: yo.lng } : null),
    [yo],
  );

  const paradasOrdenadas = rutaData?.paradas ?? [];
  const paradaSiguiente = paradasOrdenadas[paradaActual] ?? null;
  const destinoTramo = paradaSiguiente
    ? { lat: paradaSiguiente.lat, lng: paradaSiguiente.lng }
    : null;

  useEffect(() => {
    if (!rutaData?.paradas.length) {
      setRutaCompleta(null);
      return;
    }
    const pendientes = rutaData.paradas.slice(paradaActual);
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
  }, [rutaData, yoPunto, paradaActual]);

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

  const compartir = useCallback(async () => {
    if (!rutaData) return;
    const url = enlaceRutaCompartida(rutaData);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Modo Recogida",
          text: `${paradasOrdenadas.length} motos`,
          url,
        });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiado(true);
      window.setTimeout(() => setLinkCopiado(false), 2000);
    } catch {
      window.prompt("Copia este link:", url);
    }
  }, [rutaData, paradasOrdenadas.length]);

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
        <p>Link de Modo Recogida no válido.</p>
        <Button asChild variant="secondary">
          <Link href="/recoger-bogota">Ir a Bogotá</Link>
        </Button>
      </div>
    );
  }

  if (!rutaData) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">
        Cargando Modo Recogida…
      </div>
    );
  }

  const terminada = paradaActual >= paradasOrdenadas.length;
  const progreso = paradasOrdenadas.length
    ? Math.round((paradaActual / paradasOrdenadas.length) * 100)
    : 0;
  const esModoRecogida = rutaData.modo_recogida !== false;

  return (
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="shrink-0 space-y-2 border-b border-zinc-800 px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  recogidaActiva
                    ? "bg-rose-600/90 text-white"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                <RadioIcon
                  className={`size-3 ${recogidaActiva ? "animate-pulse" : ""}`}
                  aria-hidden
                />
                Modo Recogida
              </span>
              {recogidaActiva ? (
                <span className="text-[10px] font-medium text-emerald-400">
                  GPS activo
                </span>
              ) : null}
            </div>
            <h1 className="mt-1 truncate text-lg font-bold text-white">
              {rutaData.titulo ?? `${paradasOrdenadas.length} motos`}
            </h1>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Compartir ruta"
            onClick={() => void compartir()}
          >
            <Share2Icon className="size-4" />
          </Button>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-rose-500 transition-all"
            style={{ width: `${progreso}%` }}
          />
        </div>

        <p className="text-[11px] tabular-nums text-zinc-500" role="status">
          {terminada
            ? "Recogida completada"
            : !recogidaActiva
              ? "Permite el GPS para iniciar la recogida…"
              : rutaTramo
                ? `Siguiente: ${paradaSiguiente?.placa} · ${formatearDistanciaRuta(rutaTramo.distancia_m)} · ${formatearDuracionRuta(rutaTramo.duracion_s)}`
                : cargandoRuta
                  ? "Calculando ruta desde tu ubicación…"
                  : "Esperando GPS…"}
          {distanciaAParada != null && !terminada && recogidaActiva
            ? ` · ${Math.round(distanciaAParada)} m`
            : null}
        </p>
      </header>

      <div className="relative min-h-0 flex-1">
        <MapaConducirRuta
          yo={yoPunto}
          paradas={paradasMapa}
          paradaActual={paradaActual}
          rutaCompleta={rutaCompleta?.puntos ?? []}
          rutaTramo={rutaTramo?.puntos ?? []}
        />

        {!recogidaActiva && esModoRecogida ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-zinc-950/85 px-6 text-center backdrop-blur-sm">
            <MapPinIcon className="size-10 text-rose-400" aria-hidden />
            <div>
              <p className="text-base font-bold text-white">Modo Recogida</p>
              <p className="mt-1 text-sm text-zinc-400">
                {paradasOrdenadas.length} motos en ruta. Activa tu GPS para
                navegar parada a parada.
              </p>
            </div>
            <Button
              type="button"
              className="h-12 w-full max-w-xs bg-rose-600 hover:bg-rose-500"
              onClick={() => setGpsActivo(true)}
            >
              Activar GPS e iniciar recogida
            </Button>
            {gpsError ? (
              <p className="text-xs text-rose-400" role="alert">
                {gpsError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 space-y-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {gpsError && recogidaActiva ? (
          <p className="text-xs text-rose-400" role="alert">
            {gpsError}
          </p>
        ) : null}

        {recogidaActiva && yo ? (
          <p className="text-[11px] tabular-nums text-sky-300/90">
            Tu GPS: {yo.lat.toFixed(5)}, {yo.lng.toFixed(5)}
            {yo.accuracy_m != null ? ` · ±${Math.round(yo.accuracy_m)} m` : ""}
          </p>
        ) : null}

        {!terminada && paradaSiguiente && recogidaActiva ? (
          <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2">
            <p className="text-xs text-rose-300/80">
              Parada {paradaActual + 1} de {paradasOrdenadas.length}
            </p>
            <p className="text-base font-bold tracking-wide">
              {paradaSiguiente.placa}
            </p>
            <p className="text-sm text-zinc-400">{paradaSiguiente.nombre}</p>
            <p className="text-sm font-semibold tabular-nums text-rose-400">
              {formatearCOP(paradaSiguiente.deuda_total)}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          {mapsHref && !terminada && recogidaActiva ? (
            <Button
              type="button"
              className="col-span-2 h-12 bg-emerald-700 hover:bg-emerald-600"
              asChild
            >
              <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                <NavigationIcon className="mr-2 size-4" />
                Navegar en Maps
              </a>
            </Button>
          ) : null}

          {!terminada && recogidaActiva ? (
            <Button
              type="button"
              variant={cercaDeParada ? "default" : "secondary"}
              className="col-span-2 h-12 bg-rose-600 hover:bg-rose-500"
              onClick={marcarLlegada}
            >
              <CheckIcon className="mr-2 size-4" />
              {cercaDeParada
                ? "Llegué — siguiente moto"
                : "Marcar moto recogida"}
            </Button>
          ) : terminada ? (
            <Button
              type="button"
              variant="secondary"
              className="col-span-2 h-12"
              asChild
            >
              <Link href="/recoger-bogota">Volver a Bogotá</Link>
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            className="col-span-2 h-11"
            onClick={() => void compartir()}
          >
            <CopyIcon className="mr-2 size-4" />
            {linkCopiado ? "Link copiado" : "Copiar link"}
          </Button>
        </div>

        <ol
          className="max-h-24 space-y-1 overflow-y-auto text-xs"
          aria-label="Paradas"
        >
          {paradasOrdenadas.map((p, i) => (
            <li
              key={p.placa}
              className={
                i < paradaActual
                  ? "text-zinc-600 line-through"
                  : i === paradaActual
                    ? "font-semibold text-rose-300"
                    : "text-zinc-400"
              }
            >
              {i + 1}. {p.placa} · {formatearCOP(p.deuda_total)}
            </li>
          ))}
        </ol>
      </footer>
    </div>
  );
}
