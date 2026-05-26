import { NextResponse } from "next/server";

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
