import type { PuntoRuta } from "@/lib/rutaOsrm";

export type ParadaRuta = {
  placa: string;
  nombre: string;
  deuda_total: number;
  lat: number;
  lng: number;
};

export type RutaCompartida = {
  titulo?: string;
  origen: PuntoRuta;
  paradas: ParadaRuta[];
  /** ISO */
  creada_en: string;
  /** Link abre navegación en campo con GPS del operador. */
  modo_recogida?: boolean;
};

export function codificarRuta(ruta: RutaCompartida): string {
  const json = JSON.stringify(ruta);
  if (typeof btoa !== "undefined") {
    return btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, "utf-8").toString("base64");
}

export function decodificarRuta(raw: string): RutaCompartida | null {
  try {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    let json: string;
    if (typeof atob !== "undefined") {
      json = decodeURIComponent(escape(atob(trimmed)));
    } else {
      json = Buffer.from(trimmed, "base64").toString("utf-8");
    }
    const data = JSON.parse(json) as RutaCompartida;
    if (!data?.origen || !Array.isArray(data.paradas)) return null;
    return data;
  } catch {
    return null;
  }
}

export function enlaceRutaCompartida(ruta: RutaCompartida): string {
  const q = codificarRuta(ruta);
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : "";
  return `${base}/ruta?q=${encodeURIComponent(q)}`;
}
