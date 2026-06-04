import { NextResponse } from "next/server";

import { fetchVehiculoPorPlaca } from "@/lib/vehiculoPorPlaca";
import { supabase } from "@/lib/supabase";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import {
  buscarUbicacionGps,
  mensajeGpsNoDisponible,
  resolverProveedorGps,
} from "@/lib/gpsMoto";

export const runtime = "nodejs";

async function obtenerGpsMotoPlaca(placa: string): Promise<string> {
  const placaNorm = normalizarPlaca(placa);
  const { data, error } = await supabase
    .from("placas")
    .select("gps_moto")
    .eq("placa", placaNorm)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[placa] gps_moto:", error.message);
    return "";
  }
  return String(data?.gps_moto ?? "").trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placa = searchParams.get("placa")?.trim();
  if (!placa) {
    return NextResponse.json(
      { error: "Falta el parámetro placa" },
      { status: 400 },
    );
  }

  try {
    const vehiculo = await fetchVehiculoPorPlaca(placa);
    if (!vehiculo) {
      return NextResponse.json(
        { error: "No se encontró la placa", placa: placa.toUpperCase() },
        { status: 404 },
      );
    }

    const gps_moto = await obtenerGpsMotoPlaca(placa);
    const proveedor = resolverProveedorGps(gps_moto);
    const resultadoGps = await buscarUbicacionGps(placa, gps_moto);

    const gps = resultadoGps.ok ? resultadoGps.gps : null;
    const gps_mensaje = gps
      ? null
      : mensajeGpsNoDisponible(
          placa,
          resultadoGps.ok ? "sin_dispositivo" : resultadoGps.motivo,
          gps_moto,
        );

    return NextResponse.json({
      vehiculo,
      gps,
      gps_moto: gps_moto || proveedor,
      gps_proveedor: proveedor,
      gps_mensaje,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error leyendo datos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
