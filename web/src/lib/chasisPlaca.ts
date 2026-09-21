/**
 * AirTags nombrados con los últimos 4 del chasis → placa real.
 * Find My reporta el chasis; en cartera/UI mostramos la placa.
 */
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

/** Últimos 4 del chasis (y variantes sin ceros) → placa. Fuentes: SP Bogotá/Girardot/BGA. */
export const CHASIS_A_PLACA: Readonly<Record<string, string>> = {
  "4791": "LXR49I",
  "4799": "LXR50I",
  "4806": "LXR58I",
  "5418": "LXR51I",
  "5424": "LXR52I",
  "5426": "LYB89I",
  "5437": "LYB90I",
  "0803": "LYB91I",
  "0807": "LYB92I",
  "1424": "LYB93I",
  "3476": "LXR55I",
  "3478": "LXR53I",
  "3484": "LXR54I",
  "3491": "LXR56I",
  "3492": "LXR57I",
  "3494": "LYC67I",
  "3498": "LYB94I",
  "9561": "LYB95I",
  "0230": "LZE12I",
  "0096": "LYB96I",
  // Find My a veces recorta ceros: 0005 → "5"
  "0005": "JQX11I",
  "5": "JQX11I",
};

const PLACA_A_CHASIS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(CHASIS_A_PLACA).map(([chasis, placa]) => [
    normalizarPlaca(placa),
    chasis,
  ]),
);

/** Normaliza nombre Find My (chasis o placa) → placa de cartera. */
export function resolverPlacaDesdeNombreAirTag(
  name: string | null | undefined,
): string {
  const key = normalizarPlaca(String(name ?? ""));
  if (!key) return "";
  const desdeChasis = CHASIS_A_PLACA[key] ?? CHASIS_A_PLACA[key.padStart(4, "0")];
  if (desdeChasis) return normalizarPlaca(desdeChasis);
  return key;
}

/** Si la placa tiene alias de chasis (para keyring BLE legacy). */
export function chasisAliasDePlaca(placa: string): string | null {
  const key = normalizarPlaca(placa);
  return PLACA_A_CHASIS[key] ?? null;
}
