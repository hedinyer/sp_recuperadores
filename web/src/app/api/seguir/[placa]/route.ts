import { NextResponse } from "next/server";

import {
  buscarUbicacionGps,
  buscarUbicacionGpsEnVivo,
  mensajeGpsNoDisponible,
} from "@/lib/gpsMoto";
import { etiquetaEstadoGps } from "@/lib/ubicacionGps";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo datos de posición (sin comandos de motor). Público para links de seguimiento. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ placa: string }> },
) {
  const { placa: raw } = await context.params;
  const placa = normalizarPlaca(decodeURIComponent(raw ?? ""));
  if (!placa || placa.length < 5) {
    return NextResponse.json({ error: "Placa inválida" }, { status: 400 });
  }

  try {
    let resultado = await buscarUbicacionGpsEnVivo(placa);
    // Si el proveedor falla en vivo, intentar última posición conocida.
    if (!resultado.ok) {
      resultado = await buscarUbicacionGps(placa);
    }

    if (!resultado.ok) {
      return NextResponse.json({
        placa,
        gps: null,
        mensaje: mensajeGpsNoDisponible(placa, resultado.motivo),
        actualizadoEn: new Date().toISOString(),
      });
    }

    const g = resultado.gps;
    return NextResponse.json({
      placa,
      gps: {
        lat: g.lat,
        lng: g.lng,
        speed: g.speed,
        course: g.course,
        online: g.online,
        estado: etiquetaEstadoGps(g.online),
        time: g.time,
      },
      actualizadoEn: new Date().toISOString(),
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al consultar GPS de la placa";
    console.error("[api/seguir]", placa, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
