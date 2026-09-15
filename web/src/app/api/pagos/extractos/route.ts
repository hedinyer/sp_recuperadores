import { NextResponse } from "next/server";

import { listExtractosConFechas } from "@/lib/pagosOcrClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const data = await listExtractosConFechas();
    return NextResponse.json({
      ok: true,
      activo_id: data.activo_id,
      extractos: data.extractos.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        filas: e.filas,
        activo: e.activo,
        created_at: e.created_at,
        fechas: e.fechas,
        fecha_min: e.fecha_min,
        fecha_max: e.fecha_max,
      })),
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "No se pudieron listar extractos";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
