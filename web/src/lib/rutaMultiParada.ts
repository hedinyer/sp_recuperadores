import type { PuntoRuta, RutaConduccion } from "@/lib/rutaOsrm";
import { obtenerRutaConduccion } from "@/lib/rutaOsrm";

export type ParadaConId = PuntoRuta & { id: string };

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

/** Vecino más cercano desde origen (heurística TSP rápida). */
export function optimizarOrdenParadas(
  origen: PuntoRuta,
  paradas: ParadaConId[],
): ParadaConId[] {
  if (paradas.length <= 1) return [...paradas];
  const restantes = [...paradas];
  const orden: ParadaConId[] = [];
  let actual = origen;

  while (restantes.length) {
    let mejorIdx = 0;
    let mejorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = distMetros(actual, restantes[i]!);
      if (d < mejorDist) {
        mejorDist = d;
        mejorIdx = i;
      }
    }
    const next = restantes.splice(mejorIdx, 1)[0]!;
    orden.push(next);
    actual = next;
  }
  return orden;
}

/** Intenta OSRM Trip; si falla usa vecino más cercano. */
export async function optimizarOrdenParadasOsrm(
  origen: PuntoRuta,
  paradas: ParadaConId[],
  signal?: AbortSignal,
): Promise<ParadaConId[]> {
  if (paradas.length <= 1) return [...paradas];

  const coords = [
    `${origen.lng},${origen.lat}`,
    ...paradas.map((p) => `${p.lng},${p.lat}`),
  ].join(";");

  const url =
    `https://router.project-osrm.org/trip/v1/driving/${coords}` +
    `?source=first&roundtrip=false&geometries=geojson`;

  try {
    const res = await fetch(url, { signal, cache: "no-store" });
    if (!res.ok) throw new Error("OSRM trip");
    const data = (await res.json()) as {
      code?: string;
      waypoints?: Array<{ waypoint_index?: number }>;
    };
    if (data.code !== "Ok" || !data.waypoints?.length) {
      throw new Error("sin trip");
    }
    const indices = data.waypoints
      .map((w, i) => ({ i, idx: w.waypoint_index ?? i }))
      .filter((x) => x.i > 0)
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.i - 1);

    if (indices.length !== paradas.length) {
      return optimizarOrdenParadas(origen, paradas);
    }
    return indices.map((i) => paradas[i]!);
  } catch {
    return optimizarOrdenParadas(origen, paradas);
  }
}

/** Ruta de conducción concatenando tramos OSRM entre paradas ordenadas. */
export async function obtenerRutaCompleta(
  origen: PuntoRuta,
  paradasOrdenadas: PuntoRuta[],
  signal?: AbortSignal,
): Promise<RutaConduccion> {
  if (!paradasOrdenadas.length) {
    return { puntos: [origen], distancia_m: 0, duracion_s: 0 };
  }

  const todosPuntos: PuntoRuta[] = [];
  let distancia_m = 0;
  let duracion_s = 0;
  let desde = origen;

  for (const hasta of paradasOrdenadas) {
    const tramo = await obtenerRutaConduccion(desde, hasta, signal);
    if (signal?.aborted) break;
    if (todosPuntos.length === 0) {
      todosPuntos.push(...tramo.puntos);
    } else {
      todosPuntos.push(...tramo.puntos.slice(1));
    }
    distancia_m += tramo.distancia_m;
    duracion_s += tramo.duracion_s;
    desde = hasta;
  }

  return { puntos: todosPuntos, distancia_m, duracion_s };
}

/** Distancia en metros del punto a la polyline (mínima). */
export function distanciaAPolylineM(
  punto: PuntoRuta,
  polyline: PuntoRuta[],
): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return distMetros(punto, polyline[0]!);

  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    min = Math.min(min, distPuntoSegmentoM(punto, a, b));
  }
  return min;
}

function distPuntoSegmentoM(p: PuntoRuta, a: PuntoRuta, b: PuntoRuta): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) return distMetros(p, a);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy),
    ),
  );
  const proj = { lat: a.lat + t * dy, lng: a.lng + t * dx };
  return distMetros(p, proj);
}

export function indiceParadaMasCercana(
  yo: PuntoRuta,
  paradas: PuntoRuta[],
  completadas: number,
): number {
  let mejor = completadas;
  let mejorDist = Infinity;
  for (let i = completadas; i < paradas.length; i++) {
    const d = distMetros(yo, paradas[i]!);
    if (d < mejorDist) {
      mejorDist = d;
      mejor = i;
    }
  }
  return mejor;
}
