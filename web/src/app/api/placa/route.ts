import { NextResponse } from "next/server";

import { getFilasReporte } from "@/lib/cargarReporte";
import { buscarPorPlaca } from "@/lib/csvPlaca";
import { supabase } from "@/lib/supabase";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import {
  buscarUbicacionGps,
  mensajeGpsNoDisponible,
} from "@/lib/systemTrackGps";

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
    const rows = await getFilasReporte();
    if (!rows.length) {
      return NextResponse.json(
        { error: "El reporte está vacío o no es válido" },
        { status: 503 },
      );
    }
    const vehiculo = buscarPorPlaca(rows, placa);
    if (!vehiculo) {
      return NextResponse.json(
        { error: "No se encontró la placa", placa: placa.toUpperCase() },
        { status: 404 },
      );
    }

    const [resultadoGps, gps_moto] = await Promise.all([
      buscarUbicacionGps(placa),
      obtenerGpsMotoPlaca(placa),
    ]);

    const gps = resultadoGps.ok ? resultadoGps.gps : null;
    const gps_mensaje = gps
      ? null
      : mensajeGpsNoDisponible(
          placa,
          resultadoGps.ok ? "sin_dispositivo" : resultadoGps.motivo,
        );

    return NextResponse.json({ vehiculo, gps, gps_moto, gps_mensaje });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error leyendo datos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
