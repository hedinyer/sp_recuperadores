import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/adminAuth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

function esPendiente(estado: string | null | undefined): boolean {
  const e = String(estado ?? "pendiente").trim().toLowerCase();
  return !e || e === "pendiente";
}

export async function PATCH(request: Request) {
  try {
    if (!(await hasAdminSession())) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const nombre_recuperador = String(body.nombre_recuperador ?? "").trim();
    const idsRaw = body.ids;

    if (!nombre_recuperador) {
      return NextResponse.json(
        { error: "Falta el recuperador destino" },
        { status: 400 },
      );
    }

    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return NextResponse.json(
        { error: "Selecciona al menos una placa" },
        { status: 400 },
      );
    }

    const ids = [...new Set(idsRaw.map((id) => Number(id)).filter((id) => id > 0))];
    if (ids.length === 0) {
      return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
    }

    const { data: filas, error: fetchError } = await supabase
      .from("recuperadores")
      .select("id, estado_moto, placa_asignada, nombre_recuperador")
      .in("id", ids);

    if (fetchError) throw fetchError;

    if (!filas?.length) {
      return NextResponse.json(
        { error: "No se encontraron las asignaciones" },
        { status: 404 },
      );
    }

    const noPendientes = filas.filter((f) => !esPendiente(f.estado_moto));
    if (noPendientes.length > 0) {
      const placas = noPendientes
        .map((f) => String(f.placa_asignada ?? "").trim())
        .filter(Boolean)
        .join(", ");
      return NextResponse.json(
        {
          error: `Solo se pueden reasignar placas pendientes. No pendiente: ${placas}`,
        },
        { status: 400 },
      );
    }

    const ahora = new Date().toISOString();
    const { data: actualizadas, error: updateError } = await supabase
      .from("recuperadores")
      .update({
        nombre_recuperador,
        fecha_hora_asignada: ahora,
      })
      .in("id", ids)
      .select("id, placa_asignada");

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      reasignadas: actualizadas?.length ?? 0,
      placas: (actualizadas ?? []).map((r) => r.placa_asignada),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al reasignar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
