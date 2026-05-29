export type MotivoGpsError = "no_soporte" | "denegado" | "timeout" | "error";

export type ResultadoGps =
  | { ok: true; coords: string }
  | { ok: false; motivo: MotivoGpsError };

/** Devuelve "lat,lng" con hasta 6 decimales. */
export function obtenerGpsUbicacion(): Promise<ResultadoGps> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, motivo: "no_soporte" });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        resolve({ ok: true, coords: `${lat},${lng}` });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({ ok: false, motivo: "denegado" });
        } else if (err.code === err.TIMEOUT) {
          resolve({ ok: false, motivo: "timeout" });
        } else {
          resolve({ ok: false, motivo: "error" });
        }
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
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
