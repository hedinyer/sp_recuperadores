import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import { supabase } from "@/lib/supabase";

/**
 * Placas en gestión: publicadas pendientes/asignadas o con recuperador pendiente.
 */
export async function fetchPlacasPendientes(): Promise<string[]> {
  const set = new Set<string>();

  const [{ data: placas, error: errPlacas }, { data: recups, error: errRecup }] =
    await Promise.all([
      supabase.from("placas").select("placa, status"),
      supabase
        .from("recuperadores")
        .select("placa_asignada")
        .eq("estado_moto", "pendiente"),
    ]);

  if (errPlacas) throw errPlacas;
  if (errRecup) throw errRecup;

  for (const row of placas ?? []) {
    const st = String(row.status ?? "").toLowerCase();
    if (st === "pendiente" || st === "asignada") {
      const norm = normalizarPlaca(String(row.placa ?? ""));
      if (norm) set.add(norm);
    }
  }

  for (const row of recups ?? []) {
    const norm = normalizarPlaca(String(row.placa_asignada ?? ""));
    if (norm) set.add(norm);
  }

  return [...set];
}
