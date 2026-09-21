import { resolverPlacaDesdeNombreAirTag } from "@/lib/chasisPlaca";
import { variantesPlaca } from "@/lib/placaGps";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

export const LOCATIONS_JSON_URL_DEFAULT =
  "https://rpjkwoxqnvwcnlnffudt.supabase.co/storage/v1/object/public/airtags/locations.json";

export type UbicacionAirTag = {
  placa: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  visto_en: string | null;
};

type DeviceJson = {
  name?: string;
  found?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
  timestamp?: string | null;
};

type LocationsJson = {
  devices?: DeviceJson[];
};

export function locationsJsonUrl(): string {
  return (
    process.env.LOCATIONS_JSON_URL?.trim() || LOCATIONS_JSON_URL_DEFAULT
  );
}

/** Mapa placa → ubicación AirTag (solo found + coords válidas). */
export async function fetchUbicacionesAirTag(): Promise<
  Map<string, UbicacionAirTag>
> {
  const url = locationsJsonUrl();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer locations.json (${res.status})`);
  }
  const data = (await res.json()) as LocationsJson;
  const map = new Map<string, UbicacionAirTag>();

  for (const d of data.devices ?? []) {
    if (!d.found) continue;
    const lat = Number(d.latitude);
    const lng = Number(d.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const placa = resolverPlacaDesdeNombreAirTag(d.name);
    if (!placa) continue;

    const accuracy =
      typeof d.accuracy_m === "number" && Number.isFinite(d.accuracy_m)
        ? d.accuracy_m
        : null;
    const visto_en =
      typeof d.timestamp === "string" && d.timestamp.trim()
        ? d.timestamp.trim()
        : null;

    const prev = map.get(placa);
    // Preferir la lectura más reciente si hay duplicados.
    if (
      prev?.visto_en &&
      visto_en &&
      new Date(visto_en).getTime() < new Date(prev.visto_en).getTime()
    ) {
      continue;
    }

    map.set(placa, {
      placa,
      lat,
      lng,
      accuracy_m: accuracy,
      visto_en,
    });
  }

  return map;
}

/** Busca AirTag por placa y variantes (H/sin H, etc.). */
export function resolverUbicacionAirTag(
  placa: string,
  mapa: Map<string, UbicacionAirTag>,
): UbicacionAirTag | null {
  for (const clave of variantesPlaca(placa)) {
    const hit = mapa.get(clave) ?? mapa.get(normalizarPlaca(clave));
    if (hit) return hit;
  }
  return null;
}
