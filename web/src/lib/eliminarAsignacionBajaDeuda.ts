import { supabase } from "@/lib/supabase";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import { fetchVehiculoPorPlaca } from "@/lib/vehiculoPorPlaca";

/** Deuda mínima para mantener una placa asignada: $200.000 COP. */
export const DEUDA_MIN_ASIGNADA_COP = 200_000;

export function parseDeudaTotal(
  deuda: string | number | undefined | null,
): number {
  if (deuda == null || deuda === "") return 0;
  const n =
    typeof deuda === "string"
      ? Number(deuda.replace(/,/g, ""))
      : Number(deuda);
  return Number.isNaN(n) ? 0 : n;
}

export function esEstadoAsignacionPendiente(
  estado: string | null | undefined,
): boolean {
  const e = String(estado ?? "pendiente").trim().toLowerCase();
  return !e || e === "pendiente";
}

export async function placaTieneAsignacionPendiente(
  placa: string,
): Promise<boolean> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm) return false;

  const { data, error } = await supabase
    .from("recuperadores")
    .select("id, estado_moto")
    .eq("placa_asignada", placaNorm);

  if (error) throw error;
  return (data ?? []).some((r) => esEstadoAsignacionPendiente(r.estado_moto));
}

/** Elimina asignaciones pendientes y la publicación en placas si la deuda es baja. */
export async function eliminarAsignacionBajaDeuda(
  placa: string,
  deudaTotal: number,
): Promise<boolean> {
  if (deudaTotal >= DEUDA_MIN_ASIGNADA_COP) return false;

  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm) return false;

  const tienePendiente = await placaTieneAsignacionPendiente(placaNorm);
  if (!tienePendiente) return false;

  const { data: pendientes, error: selErr } = await supabase
    .from("recuperadores")
    .select("id, estado_moto")
    .eq("placa_asignada", placaNorm);

  if (selErr) throw selErr;

  const ids = (pendientes ?? [])
    .filter((r) => esEstadoAsignacionPendiente(r.estado_moto))
    .map((r) => r.id);

  if (ids.length > 0) {
    const { error: delRecup } = await supabase
      .from("recuperadores")
      .delete()
      .in("id", ids);
    if (delRecup) throw delRecup;
  }

  const { error: delPlacas } = await supabase
    .from("placas")
    .delete()
    .eq("placa", placaNorm)
    .in("status", ["asignada", "pendiente"]);

  if (delPlacas) throw delPlacas;

  return true;
}

export async function revisarYEliminarAsignacionPorPlaca(
  placa: string,
): Promise<boolean> {
  const vehiculo = await fetchVehiculoPorPlaca(placa);
  if (!vehiculo) return false;
  const deuda = parseDeudaTotal(vehiculo.deuda_total);
  return eliminarAsignacionBajaDeuda(placa, deuda);
}

type FilaRecuperador = {
  placa_asignada?: string | null;
  estado_moto?: string | null;
};

/** Revisa placas pendientes y excluye las eliminadas por deuda baja. */
export async function filtrarAsignacionesBajaDeuda<T extends FilaRecuperador>(
  rows: T[],
): Promise<T[]> {
  const placasPendientes = new Set<string>();
  for (const row of rows) {
    const placa = normalizarPlaca(row.placa_asignada || "");
    if (placa && esEstadoAsignacionPendiente(row.estado_moto)) {
      placasPendientes.add(placa);
    }
  }

  const eliminadas = new Set<string>();
  await Promise.all(
    [...placasPendientes].map(async (placa) => {
      try {
        const eliminada = await revisarYEliminarAsignacionPorPlaca(placa);
        if (eliminada) eliminadas.add(placa);
      } catch (e) {
        console.warn(`[asignacion] revisión deuda ${placa}:`, e);
      }
    }),
  );

  if (eliminadas.size === 0) return rows;

  return rows.filter((row) => {
    const placa = normalizarPlaca(row.placa_asignada || "");
    if (eliminadas.has(placa) && esEstadoAsignacionPendiente(row.estado_moto)) {
      return false;
    }
    return true;
  });
}
