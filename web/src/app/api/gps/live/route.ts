import { NextResponse } from "next/server";

import {
  buscarUbicacionGpsEnVivo,
  mensajeGpsNoDisponible,
} from "@/lib/systemTrackGps";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placa = searchParams.get("placa")?.trim();
  if (!placa) {
    return NextResponse.json(
      { error: "Falta el parámetro placa" },
      { status: 400 },
    );
  }

  const deviceIdRaw = searchParams.get("device_id");
  const deviceId = deviceIdRaw ? Number(deviceIdRaw) : undefined;

  try {
    const resultado = await buscarUbicacionGpsEnVivo(
      placa,
      Number.isFinite(deviceId) && deviceId! > 0 ? deviceId : undefined,
    );

    if (!resultado.ok) {
      return NextResponse.json({
        gps: null,
        mensaje: mensajeGpsNoDisponible(placa, resultado.motivo),
      });
    }

    return NextResponse.json({
      gps: resultado.gps,
      actualizadoEn: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar GPS";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
