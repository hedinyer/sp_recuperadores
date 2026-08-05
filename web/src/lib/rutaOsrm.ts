export type PuntoRuta = { lat: number; lng: number };

export type RutaConduccion = {
  puntos: PuntoRuta[];
  distancia_m: number;
  duracion_s: number;
};

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

/** ¿Se movió lo suficiente como para recalcular la ruta? */
export function convieneRecalcularRuta(
  prevOrigen: PuntoRuta | null,
  prevDestino: PuntoRuta | null,
  origen: PuntoRuta,
  destino: PuntoRuta,
  umbralM = 40,
): boolean {
  if (!prevOrigen || !prevDestino) return true;
  return (
    distMetros(prevOrigen, origen) >= umbralM ||
    distMetros(prevDestino, destino) >= umbralM
  );
}

/**
 * Ruta en carro vía OSRM (servidor público).
 * Si falla, devuelve línea recta como respaldo.
 */
export async function obtenerRutaConduccion(
  origen: PuntoRuta,
  destino: PuntoRuta,
  signal?: AbortSignal,
): Promise<RutaConduccion> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origen.lng},${origen.lat};${destino.lng},${destino.lat}` +
    `?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, {
      signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: [number, number][] };
      }>;
    };
    const route = data.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (data.code !== "Ok" || !coords?.length) throw new Error("sin ruta");

    return {
      puntos: coords.map(([lng, lat]) => ({ lat, lng })),
      distancia_m: Number(route?.distance) || distMetros(origen, destino),
      duracion_s: Number(route?.duration) || 0,
    };
  } catch {
    return {
      puntos: [origen, destino],
      distancia_m: distMetros(origen, destino),
      duracion_s: 0,
    };
  }
}

export function formatearDistanciaRuta(metros: number): string {
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1)} km`;
}

export function formatearDuracionRuta(segundos: number): string {
  if (!segundos || segundos <= 0) return "—";
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
