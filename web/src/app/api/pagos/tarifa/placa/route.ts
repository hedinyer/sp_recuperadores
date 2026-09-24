import { NextResponse } from "next/server";

import {
  fetchVehiculoPorPlaca,
  esFuenteSp,
  mensajeBloqueoRailweb,
} from "@/lib/vehiculoPorPlaca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo lectura. No elimina asignaciones ni registros. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placa = searchParams.get("placa")?.trim();
  if (!placa) {
    return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
  }

  try {
    const vehiculo = await fetchVehiculoPorPlaca(placa);
    if (!vehiculo) {
      return NextResponse.json(
        { error: "No se encontró la placa" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      vehiculo: {
        placa: vehiculo.placa,
        nombre: vehiculo.nombre,
        cedula: vehiculo.cedula,
        valor_cuota: vehiculo.valor_cuota,
        deuda_total: vehiculo.deuda_total,
        deuda_cuotas: vehiculo.deuda_cuotas,
        deuda_multas: vehiculo.deuda_multas,
        fuente: vehiculo.fuente || "railweb",
      },
      bloqueado_railweb: esFuenteSp(vehiculo),
      mensaje_bloqueo: esFuenteSp(vehiculo)
        ? mensajeBloqueoRailweb(vehiculo)
        : null,
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al consultar la placa";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
