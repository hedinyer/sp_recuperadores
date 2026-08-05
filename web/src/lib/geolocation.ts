export type MotivoGpsError = "no_soporte" | "denegado" | "timeout" | "error";

export type GpsPreciso = {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  altitude_accuracy_m: number | null;
  heading: number | null;
  speed_mps: number | null;
  /** "lat,lng" con hasta 8 decimales */
  coords: string;
};

export type ResultadoGps =
  | { ok: true; coords: string }
  | { ok: false; motivo: MotivoGpsError };

export type ResultadoGpsPreciso =
  | { ok: true; gps: GpsPreciso }
  | { ok: false; motivo: MotivoGpsError };

function finitoONull(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function desdePosition(pos: GeolocationPosition): GpsPreciso {
  const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } =
    pos.coords;
  return {
    lat: latitude,
    lng: longitude,
    accuracy_m: finitoONull(accuracy),
    altitude_m: finitoONull(altitude),
    altitude_accuracy_m: finitoONull(altitudeAccuracy),
    heading: finitoONull(heading),
    speed_mps: finitoONull(speed),
    coords: `${latitude.toFixed(8)},${longitude.toFixed(8)}`,
  };
}

function motivoDeError(err: GeolocationPositionError): MotivoGpsError {
  if (err.code === err.PERMISSION_DENIED) return "denegado";
  if (err.code === err.TIMEOUT) return "timeout";
  return "error";
}

/** Devuelve "lat,lng" con hasta 6 decimales. */
export function obtenerGpsUbicacion(): Promise<ResultadoGps> {
  return obtenerGpsPreciso({ samples: 1, maxWaitMs: 20_000 }).then((r) =>
    r.ok ? { ok: true, coords: r.gps.coords } : r,
  );
}

/**
 * GPS de alta precisión: varias lecturas y se queda con la de menor accuracy_m.
 * enableHighAccuracy + maximumAge 0 + sin caché.
 */
export function obtenerGpsPreciso(opts?: {
  samples?: number;
  maxWaitMs?: number;
  targetAccuracyM?: number;
}): Promise<ResultadoGpsPreciso> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, motivo: "no_soporte" });
  }

  const samples = Math.max(1, opts?.samples ?? 5);
  const maxWaitMs = opts?.maxWaitMs ?? 45_000;
  const targetAccuracyM = opts?.targetAccuracyM ?? 15;

  return new Promise((resolve) => {
    let best: GpsPreciso | null = null;
    let got = 0;
    let settled = false;
    let watchId: number | null = null;

    const finish = (result: ResultadoGpsPreciso) => {
      if (settled) return;
      settled = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (best) finish({ ok: true, gps: best });
      else finish({ ok: false, motivo: "timeout" });
    }, maxWaitMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const gps = desdePosition(pos);
        got += 1;
        if (
          !best ||
          (gps.accuracy_m != null &&
            (best.accuracy_m == null || gps.accuracy_m < best.accuracy_m))
        ) {
          best = gps;
        }
        if (
          best.accuracy_m != null &&
          best.accuracy_m <= targetAccuracyM &&
          got >= 2
        ) {
          finish({ ok: true, gps: best });
          return;
        }
        if (got >= samples && best) {
          finish({ ok: true, gps: best });
        }
      },
      (err) => {
        if (best) finish({ ok: true, gps: best });
        else finish({ ok: false, motivo: motivoDeError(err) });
      },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 },
    );
  });
}

export function mensajeErrorGps(motivo: MotivoGpsError): string {
  switch (motivo) {
    case "no_soporte":
      return "Este dispositivo no soporta GPS.";
    case "denegado":
      return "Permite la ubicación en el navegador (Ajustes → Ubicación).";
    case "timeout":
      return "No se obtuvo la ubicación a tiempo. Sal al exterior o reintenta.";
    default:
      return "No se pudo obtener la ubicación. Reintenta.";
  }
}

export function enlaceGoogleMaps(gps: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(gps)}`;
}

export function enlaceGoogleMapsRuta(
  origen: { lat: number; lng: number },
  destino: { lat: number; lng: number },
): string {
  const o = `${origen.lat},${origen.lng}`;
  const d = `${destino.lat},${destino.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=driving`;
}

/**
 * Vigila la ubicación del celular en tiempo real.
 * Devuelve una función para detener el watch.
 */
export function vigilarGps(
  onUpdate: (gps: GpsPreciso) => void,
  onError?: (motivo: MotivoGpsError) => void,
): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError?.("no_soporte");
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => onUpdate(desdePosition(pos)),
    (err) => onError?.(motivoDeError(err)),
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 2_000 },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}
