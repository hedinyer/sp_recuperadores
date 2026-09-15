import { NextResponse } from "next/server";

import { previewPagoTarifa } from "@/lib/railwebTarifa";
import { fetchVehiculoPorPlaca } from "@/lib/vehiculoPorPlaca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      placa?: string;
      monto?: number;
      contratoId?: number;
      fechaPago?: string;
    };
    const placa = String(body.placa ?? "").trim();
    if (!placa) {
      return NextResponse.json({ error: "Escribe la placa" }, { status: 400 });
    }
    const preview = await previewPagoTarifa({
      placa,
      monto: Number(body.monto) || 0,
      contratoId:
        body.contratoId != null ? Number(body.contratoId) : undefined,
      fechaPago: body.fechaPago,
    });

    const vehiculo = await fetchVehiculoPorPlaca(placa);
    return NextResponse.json({
      ok: true,
      preview,
      vehiculo: vehiculo
        ? {
            placa: vehiculo.placa,
            nombre: vehiculo.nombre,
            cedula: vehiculo.cedula,
            valor_cuota: vehiculo.valor_cuota,
            deuda_total: vehiculo.deuda_total,
            deuda_cuotas: vehiculo.deuda_cuotas,
            deuda_multas: vehiculo.deuda_multas,
          }
        : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en preview de tarifa";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
