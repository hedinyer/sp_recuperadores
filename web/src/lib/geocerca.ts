import type { PuntoRuta } from "@/lib/rutaOsrm";

/** Ray-casting: true si el punto está dentro del polígono (≥3 vértices). */
export function puntoEnPoligono(
  punto: PuntoRuta,
  poligono: PuntoRuta[],
): boolean {
  if (poligono.length < 3) return false;
  const { lat: y, lng: x } = punto;
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const xi = poligono[i]!.lng;
    const yi = poligono[i]!.lat;
    const xj = poligono[j]!.lng;
    const yj = poligono[j]!.lat;
    const intersecta =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

export function filtrarPuntosEnPoligono<T extends PuntoRuta>(
  puntos: T[],
  poligono: PuntoRuta[] | null | undefined,
): T[] {
  if (!poligono?.length || poligono.length < 3) return puntos;
  return puntos.filter((p) => puntoEnPoligono(p, poligono));
}

/** Cierra el polígono si hace falta (copia del array). */
export function poligonoCerrado(v: PuntoRuta[]): PuntoRuta[] {
  if (v.length < 3) return [...v];
  const first = v[0]!;
  const last = v[v.length - 1]!;
  if (first.lat === last.lat && first.lng === last.lng) return [...v];
  return [...v];
}
