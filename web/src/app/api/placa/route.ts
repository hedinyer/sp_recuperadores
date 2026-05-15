import { NextResponse } from "next/server";

import { getFilasReporte } from "@/lib/cargarReporte";
import { buscarPorPlaca } from "@/lib/csvPlaca";

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
    return NextResponse.json({ vehiculo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error leyendo datos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
