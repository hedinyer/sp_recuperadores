import { normalizarPlaca } from "@/lib/syncPlacaEstado";

/** ABC12H, ABC-12H */
const PATRON_PLACA_MOTO = /[A-Z]{3}-?\d{2}H?\b/gi;
/** ABC123 */
const PATRON_PLACA_LEGACY = /[A-Z]{3}\d{3}\b/gi;
/** ABC12I, CII17I (nueva numeración con letra final) */
const PATRON_PLACA_LETRA_FINAL = /[A-Z]{3}\d{2}[A-Z0-9]\b/gi;

export function variantesPlaca(placa: string): string[] {
  const norm = normalizarPlaca(placa);
  if (!norm) return [];
  const variantes = new Set<string>([norm]);
  if (/^[A-Z]{3}\d{2}H$/.test(norm)) {
    variantes.add(norm.slice(0, -1));
  } else if (/^[A-Z]{3}\d{2}$/.test(norm)) {
    variantes.add(`${norm}H`);
  }
  if (/^[A-Z]{3}\d{2}[A-Z0-9]$/.test(norm)) {
    variantes.add(norm.slice(0, 5));
  }
  return [...variantes];
}

function registrarPlaca(claves: Set<string>, placaRaw: string): void {
  const limpia = placaRaw.trim();
  if (!limpia) return;
  for (const variante of variantesPlaca(limpia)) {
    claves.add(variante);
  }
}

/** Placa cuando el nombre del dispositivo es la placa exacta (ej. CII17I). */
export function placaDesdeNombreDispositivo(nombre: string): string | null {
  const token = normalizarPlaca(String(nombre ?? "").trim().split(/\s+/)[0] ?? "");
  if (!/^[A-Z0-9]{5,7}$/.test(token)) return null;
  if (
    /^[A-Z]{3}\d{2}[A-Z0-9]$/.test(token) ||
    /^[A-Z]{3}\d{3}$/.test(token) ||
    /^[A-Z]{3}\d{2}H?$/.test(token)
  ) {
    return token;
  }
  return null;
}

export function extraerPlacasDeTexto(texto: string): string[] {
  const raw = String(texto ?? "").toUpperCase();
  const encontradas = new Set<string>();

  for (const match of raw.matchAll(PATRON_PLACA_MOTO)) {
    registrarPlaca(encontradas, match[0]);
  }
  for (const match of raw.matchAll(PATRON_PLACA_LEGACY)) {
    registrarPlaca(encontradas, match[0]);
  }
  for (const match of raw.matchAll(PATRON_PLACA_LETRA_FINAL)) {
    registrarPlaca(encontradas, match[0]);
  }

  const directa = placaDesdeNombreDispositivo(raw);
  if (directa) registrarPlaca(encontradas, directa);

  const primero = raw.trim().split(/\s+/)[0] ?? "";
  if (/^[A-Z]{3}-?\d{2,3}[A-Z0-9]?$/i.test(primero)) {
    registrarPlaca(encontradas, primero);
  }

  return [...encontradas];
}
