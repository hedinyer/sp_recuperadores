import { normalizarPlaca } from "@/lib/syncPlacaEstado";

/** Placas que no deben aparecer en prioridad cobro ni reporte de atrasos. */
export const PLACAS_EXCLUIDAS_REPORTES = ["TIR90H"] as const;

const EXCLUIDAS_NORM = new Set(
  PLACAS_EXCLUIDAS_REPORTES.map((p) => normalizarPlaca(p)),
);

export function placaExcluidaDeReportes(placa: string): boolean {
  const key = normalizarPlaca(placa);
  return key !== "" && EXCLUIDAS_NORM.has(key);
}
