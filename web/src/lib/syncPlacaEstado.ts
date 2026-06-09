import { supabase } from "@/lib/supabase";

export function normalizarPlaca(placa: string): string {
  return placa.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function esEstadoAsignacionPendiente(
  estado: string | null | undefined,
): boolean {
  const e = String(estado ?? "pendiente").trim().toLowerCase();
  return !e || e === "pendiente";
}

/** Mapea estado_moto de recuperadores al status de la tabla placas. */
export function statusPlacaDesdeEstadoMoto(estado_moto: string): string | null {
  const e = estado_moto.trim().toLowerCase();
  if (e === "abonó" || e === "abono") return "abonada";
  if (e === "recuperada") return "recuperada";
  return null;
}

/** Actualiza status en placas para la placa indicada (todas las filas de esa placa). */
export async function actualizarStatusPlaca(
  placa: string,
  estado_moto: string,
): Promise<void> {
  const status = statusPlacaDesdeEstadoMoto(estado_moto);
  if (!status) return;

  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm) return;

  const { data: actualizadas, error } = await supabase
    .from("placas")
    .update({ status })
    .eq("placa", placaNorm)
    .select("id");

  if (error) throw error;

  if (!actualizadas?.length) {
    const { error: insertError } = await supabase.from("placas").insert({
      placa: placaNorm,
      status,
      fecha: new Date().toISOString(),
      gps_moto: "iop gps",
    });
    if (insertError) throw insertError;
  }
}

export type OrigenPlacaPendiente = "placas" | "recuperadores";

/** True si la placa ya está pendiente en placas o recuperadores. */
export async function placaEstaPendiente(
  placa: string,
): Promise<{ pendiente: boolean; origen?: OrigenPlacaPendiente }> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm) return { pendiente: false };

  const [{ data: enPlacas, error: errPlacas }, { data: enRecup, error: errRecup }] =
    await Promise.all([
      supabase
        .from("placas")
        .select("id")
        .eq("placa", placaNorm)
        .eq("status", "pendiente")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("recuperadores")
        .select("id")
        .eq("placa_asignada", placaNorm)
        .eq("estado_moto", "pendiente")
        .limit(1)
        .maybeSingle(),
    ]);

  if (errPlacas) throw errPlacas;
  if (errRecup) throw errRecup;

  if (enPlacas) return { pendiente: true, origen: "placas" };
  if (enRecup) return { pendiente: true, origen: "recuperadores" };
  return { pendiente: false };
}

export function mensajePlacaPendiente(origen: OrigenPlacaPendiente): string {
  if (origen === "placas") {
    return "Esta placa ya está pendiente en el listado publicado";
  }
  return "Esta placa está pendiente con un recuperador asignado";
}

/** Asignación pendiente en recuperadores para una placa (la más reciente). */
export async function buscarAsignacionPendientePorPlaca(
  placa: string,
): Promise<{ id: number; nombre_recuperador: string | null } | null> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm) return null;

  const { data, error } = await supabase
    .from("recuperadores")
    .select("id, nombre_recuperador, estado_moto, fecha_hora_asignada")
    .eq("placa_asignada", placaNorm)
    .order("fecha_hora_asignada", { ascending: false });

  if (error) throw error;

  const pendiente = (data ?? []).find((row) =>
    esEstadoAsignacionPendiente(row.estado_moto),
  );
  if (!pendiente?.id) return null;

  return {
    id: pendiente.id,
    nombre_recuperador: pendiente.nombre_recuperador
      ? String(pendiente.nombre_recuperador).trim() || null
      : null,
  };
}

export type FilaRecuperadorSync = {
  placa_asignada: string;
  estado_moto: string;
  nombre_recuperador?: string;
  pagado?: number;
  multa?: number;
  tipo_pago?: string | null;
  presencial?: boolean | null;
  foto?: string | null;
  gps_ubicacion?: string | null;
};

/** Sincroniza placas y devuelve cuántas filas de placas se actualizaron. */
export async function sincronizarPagosHistoricos(): Promise<{
  placas_actualizadas: number;
  recuperadores_revisados: number;
}> {
  const { data: filas, error } = await supabase
    .from("recuperadores")
    .select(
      "placa_asignada, estado_moto, Pagado, nombre_recuperador, fecha_hora_asignada",
    )
    .order("fecha_hora_asignada", { ascending: false });

  if (error) throw error;

  const ultimoPorPlaca = new Map<string, { estado_moto: string; pagado: number }>();

  for (const row of filas ?? []) {
    const placa = normalizarPlaca(String(row.placa_asignada ?? ""));
    if (!placa || ultimoPorPlaca.has(placa)) continue;

    const estado = String(row.estado_moto ?? "").trim() || "pendiente";
    const pagado = Number(row.Pagado) || 0;
    const esPago =
      estado.toLowerCase() === "abonó" ||
      estado.toLowerCase() === "abono" ||
      estado.toLowerCase() === "recuperada" ||
      pagado > 0;

    if (esPago) {
      ultimoPorPlaca.set(placa, { estado_moto: estado, pagado });
    }
  }

  let placas_actualizadas = 0;
  for (const [placa, { estado_moto }] of ultimoPorPlaca) {
    const status = statusPlacaDesdeEstadoMoto(estado_moto);
    if (!status) continue;

    const { data, error: upErr } = await supabase
      .from("placas")
      .update({ status })
      .eq("placa", placa)
      .select("id");

    if (upErr) throw upErr;
    placas_actualizadas += data?.length ?? 0;
  }

  return {
    placas_actualizadas,
    recuperadores_revisados: filas?.length ?? 0,
  };
}
