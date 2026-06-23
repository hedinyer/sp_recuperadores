import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/adminAuth";
import { eliminarAsignacionPendienteAdmin } from "@/lib/eliminarAsignacionBajaDeuda";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nombre_recuperador, placa_asignada } = body;

    if (!nombre_recuperador || !placa_asignada) {
      return NextResponse.json(
        { error: "Faltan nombre_recuperador o placa_asignada" },
        { status: 400 },
      );
    }

    const placa = placa_asignada.trim().toUpperCase();

    const { data: asignacion, error: insertError } = await supabase
      .from("recuperadores")
      .insert({
        nombre_recuperador,
        placa_asignada: placa,
        fecha_hora_asignada: new Date().toISOString(),
        estado_moto: "pendiente",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from("placas")
      .update({ status: "asignada" })
      .eq("placa", placa)
      .eq("status", "pendiente");

    if (updateError) throw updateError;

    return NextResponse.json({ asignacion }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al asignar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await hasAdminSession())) {
      return NextResponse.json(
        { error: "Se requiere acceso de administrador" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const id = Number(body.id);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const { placa } = await eliminarAsignacionPendienteAdmin(id);
    return NextResponse.json({ ok: true, placa });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar";
    const status = msg.includes("no encontrada") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
