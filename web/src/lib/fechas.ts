/** Parsea ISO (YYYY-MM-DD), timestamp ISO o Date → componentes locales. */
function partesFechaLocal(
  iso: string | undefined | null,
): { d: string; m: string; y: string } | null {
  if (!iso?.trim()) return null;
  const raw = iso.trim();

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split("/");
    return {
      d: d.padStart(2, "0"),
      m: m.padStart(2, "0"),
      y,
    };
  }

  const base = raw.split("T")[0].split(" ")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    const [y, m, d] = base.split("-");
    return { d, m, y };
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      d: String(parsed.getDate()).padStart(2, "0"),
      m: String(parsed.getMonth() + 1).padStart(2, "0"),
      y: String(parsed.getFullYear()),
    };
  }

  return null;
}

/** Fecha corta: dd/mm/aaaa (día / mes / año). */
export function formatFechaCorta(iso: string | undefined | null): string {
  const p = partesFechaLocal(iso);
  if (!p) return iso?.trim() ? iso.trim() : "—";
  return `${p.d}/${p.m}/${p.y}`;
}

/** Fecha y hora: dd/mm/aaaa HH:mm (día / mes / año, hora local). */
export function formatFechaHora(iso: string | undefined | null): string {
  if (!iso?.trim()) return "—";
  const raw = iso.trim();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return formatFechaCorta(iso);
  }
  const p = partesFechaLocal(iso);
  const fecha = p ? `${p.d}/${p.m}/${p.y}` : formatFechaCorta(iso);
  const hh = String(parsed.getHours()).padStart(2, "0");
  const min = String(parsed.getMinutes()).padStart(2, "0");
  return `${fecha} ${hh}:${min}`;
}

/** Días transcurridos desde una fecha (inicio de contrato, etc.). */
export function diasDesde(iso: string | undefined | null): number | null {
  if (!iso?.trim()) return null;
  const raw = iso.trim();
  const base = raw.split("T")[0].split(" ")[0];
  let inicio: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    const [y, m, d] = base.split("-").map(Number);
    inicio = new Date(y, m - 1, d);
  } else {
    inicio = new Date(raw);
  }
  if (Number.isNaN(inicio.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  inicio.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((hoy.getTime() - inicio.getTime()) / 86_400_000));
}
