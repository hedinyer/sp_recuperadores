/** Parsea CSV con separador `;` y BOM UTF-8 (mismo formato que db_general). */

export type FilaVehiculo = Record<string, string>;

export function parseCsvPuntoComa(content: string): FilaVehiculo[] {
  const normalized = content.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(";").map((h) => h.trim());
  const rows: FilaVehiculo[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(";");
    const row: FilaVehiculo = {};
    headers.forEach((h, j) => {
      row[h] = (values[j] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

export function buscarPorPlaca(
  rows: FilaVehiculo[],
  placa: string,
): FilaVehiculo | null {
  const q = placa.toUpperCase().replace(/\s/g, "");
  for (const r of rows) {
    const p = (r.placa ?? "").toUpperCase().replace(/\s/g, "");
    if (p === q) return r;
  }
  return null;
}
