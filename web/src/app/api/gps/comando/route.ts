import { NextResponse } from "next/server";

import { existePlacaActiva } from "@/lib/vehiculoPorPlaca";
import { supabase } from "@/lib/supabase";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import {
  enviarComandoMotor,
  type AccionMotorGps,
} from "@/lib/gpsMoto";

export const runtime = "nodejs";

function parseAccion(raw: unknown): AccionMotorGps | null {
  const accion = String(raw ?? "").trim().toLowerCase();
  if (accion === "bloquear" || accion === "apagar") return "bloquear";
  if (accion === "desbloquear" || accion === "prender" || accion === "encender") {
    return "desbloquear";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const placa = String(body.placa ?? "").trim();
    const accion = parseAccion(body.accion);

    if (!placa) {
      return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
    }
    if (!accion) {
      return NextResponse.json(
        { error: "Acción inválida. Usa bloquear o desbloquear." },
        { status: 400 },
      );
    }

    if (!(await existePlacaActiva(placa))) {
      return NextResponse.json(
        { error: "No se encontró la placa" },
        { status: 404 },
      );
    }

    const placaNorm = normalizarPlaca(placa);
    const { data: filaPlaca } = await supabase
      .from("placas")
      .select("gps_moto")
      .eq("placa", placaNorm)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();
    const gpsMoto = String(
      body.gps_moto ?? filaPlaca?.gps_moto ?? "",
    ).trim();

    const resultado = await enviarComandoMotor(placa, accion, gpsMoto);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true, mensaje: resultado.mensaje });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al enviar comando";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
