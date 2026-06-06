import { RECUPERADORES_FIJOS } from "@/lib/recuperadores";

export type PeriodoMetrica = "hoy" | "semana" | "mes" | "año";

export const PERIODOS_METRICA: { key: PeriodoMetrica; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "año", label: "Año" },
];

export type FilaRecuperadorMetrica = {
  nombre_recuperador?: string | null;
  fecha_hora_asignada?: string | null;
  estado_moto?: string | null;
  Pagado?: number | string | null;
  multa?: number | string | null;
  fecha_hora_recuperada?: string | null;
  fecha_hora_abono?: string | null;
};

export type MetricasRecuperador = {
  nombre: string;
  total_asignadas: number;
  abonadas: number;
  recuperadas: number;
  total_pagado: number;
  total_multa: number;
};

function parseFecha(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function inicioPeriodo(
  periodo: PeriodoMetrica,
  ahora = new Date(),
): Date {
  const inicio = new Date(ahora);
  inicio.setHours(0, 0, 0, 0);
  if (periodo === "semana") {
    const dia = inicio.getDay();
    const desdeLunes = dia === 0 ? 6 : dia - 1;
    inicio.setDate(inicio.getDate() - desdeLunes);
  } else if (periodo === "mes") {
    inicio.setDate(1);
  } else if (periodo === "año") {
    inicio.setMonth(0, 1);
  }
  return inicio;
}

function finPeriodo(ahora = new Date()): Date {
  const fin = new Date(ahora);
  fin.setHours(23, 59, 59, 999);
  return fin;
}

export function enPeriodo(
  fechaIso: string | null | undefined,
  periodo: PeriodoMetrica,
  ahora = new Date(),
): boolean {
  const fecha = parseFecha(fechaIso);
  if (!fecha) return false;
  return fecha >= inicioPeriodo(periodo, ahora) && fecha <= finPeriodo(ahora);
}

function num(val: number | string | null | undefined): number {
  const n = Number(val);
  return Number.isNaN(n) ? 0 : n;
}

function esAbono(estado: string, pagado: number): boolean {
  const e = estado.trim().toLowerCase();
  if (e === "recuperada") return false;
  return e === "abonó" || e === "abono" || pagado > 0;
}

function esRecuperada(estado: string): boolean {
  return estado.trim().toLowerCase() === "recuperada";
}

function fechaAbono(fila: FilaRecuperadorMetrica): string | null {
  return fila.fecha_hora_abono ?? fila.fecha_hora_asignada ?? null;
}

function fechaRecuperacion(fila: FilaRecuperadorMetrica): string | null {
  return fila.fecha_hora_recuperada ?? null;
}

export function calcularMetricasRecuperadores(
  filas: FilaRecuperadorMetrica[],
  periodo: PeriodoMetrica,
  ahora = new Date(),
): MetricasRecuperador[] {
  const porNombre = new Map<string, MetricasRecuperador>();

  for (const fila of filas) {
    const nombre = String(fila.nombre_recuperador ?? "").trim() || "Sin nombre";
    const estado = String(fila.estado_moto ?? "");
    const pagado = num(fila.Pagado);
    const multa = num(fila.multa);

    if (!porNombre.has(nombre)) {
      porNombre.set(nombre, {
        nombre,
        total_asignadas: 0,
        abonadas: 0,
        recuperadas: 0,
        total_pagado: 0,
        total_multa: 0,
      });
    }
    const m = porNombre.get(nombre)!;

    if (enPeriodo(fila.fecha_hora_asignada, periodo, ahora)) {
      m.total_asignadas += 1;
    }

    if (esAbono(estado, pagado) && enPeriodo(fechaAbono(fila), periodo, ahora)) {
      m.abonadas += 1;
      m.total_pagado += pagado;
      m.total_multa += multa;
    }

    if (
      esRecuperada(estado) &&
      enPeriodo(fechaRecuperacion(fila), periodo, ahora)
    ) {
      m.recuperadas += 1;
      m.total_multa += multa;
    }
  }

  const ordenados: MetricasRecuperador[] = [];
  const vistos = new Set<string>();

  for (const nombre of RECUPERADORES_FIJOS) {
    const m = porNombre.get(nombre);
    if (m) {
      ordenados.push(m);
      vistos.add(nombre);
    }
  }

  for (const [nombre, m] of porNombre) {
    if (!vistos.has(nombre)) ordenados.push(m);
  }

  return ordenados.filter(
    (m) => m.total_asignadas > 0 || m.abonadas > 0 || m.recuperadas > 0,
  );
}

export function parsePeriodoMetrica(
  raw: string | null | undefined,
): PeriodoMetrica {
  if (raw === "semana" || raw === "mes" || raw === "año" || raw === "hoy") {
    return raw;
  }
  return "hoy";
}
