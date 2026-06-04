import { NextResponse } from "next/server";

import {
  buscarUbicacionGpsEnVivo,
  mensajeGpsNoDisponible,
} from "@/lib/gpsMoto";

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
  const imei = searchParams.get("imei")?.trim() || undefined;
  const gpsMoto = searchParams.get("gps_moto");

  try {
    const resultado = await buscarUbicacionGpsEnVivo(placa, {
      gpsMoto,
      deviceId:
        Number.isFinite(deviceId) && deviceId! > 0 ? deviceId : undefined,
      imei,
    });

    if (!resultado.ok) {
      return NextResponse.json({
        gps: null,
        mensaje: mensajeGpsNoDisponible(placa, resultado.motivo, gpsMoto),
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
