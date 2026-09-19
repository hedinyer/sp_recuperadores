import { NextResponse } from "next/server";

import { registrarPagoTarifa } from "@/lib/railwebTarifa";
import { fetchVehiculoPorPlaca, esFuenteBga } from "@/lib/vehiculoPorPlaca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Solo INSERT/UPDATE de pagos. Nunca DELETE. */
export async function POST(request: Request) {
  let placaIngresada = "";
  try {
    const body = (await request.json()) as {
      placa?: string;
      monto?: number;
      referencia?: string;
      fechaPago?: string;
      configuracionId?: number;
      contratoId?: number;
    };

    const placa = String(body.placa ?? "").trim();
    placaIngresada = placa.toUpperCase();
    const monto = Math.round(Number(body.monto) || 0);
    const referencia = String(body.referencia ?? "").trim();
    const fechaPago = String(body.fechaPago ?? "").trim();
    const configuracionId = Math.round(Number(body.configuracionId) || 0);

    if (!placa) {
      return NextResponse.json({ error: "Escribe la placa" }, { status: 400 });
    }
    if (monto <= 0) {
      return NextResponse.json(
        { error: "El monto debe ser mayor que cero" },
        { status: 400 },
      );
    }
    if (!referencia) {
      return NextResponse.json(
        { error: "Ingresa la referencia del pago" },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
      return NextResponse.json(
        { error: "Fecha inválida (YYYY-MM-DD)" },
        { status: 400 },
      );
    }
    if (configuracionId <= 0) {
      return NextResponse.json(
        { error: "Elige el destinatario Nequi" },
        { status: 400 },
      );
    }

    const vehiculoCheck = await fetchVehiculoPorPlaca(placa);
    if (esFuenteBga(vehiculoCheck)) {
      return NextResponse.json(
        {
          error:
            "Esta placa está activa en BGA. No se puede registrar la tarifa en Railweb.",
          placa: placaIngresada,
          fuente: "bga",
        },
        { status: 400 },
      );
    }

    const result = await registrarPagoTarifa({
      placa,
      monto,
      referencia,
      fechaPago,
      configuracionId,
      contratoId:
        body.contratoId != null ? Number(body.contratoId) : undefined,
    });

    const vehiculo = await fetchVehiculoPorPlaca(placa);
    return NextResponse.json({
      ok: true,
      result,
      vehiculo: vehiculo
        ? {
            placa: vehiculo.placa,
            nombre: vehiculo.nombre,
            cedula: vehiculo.cedula,
            valor_cuota: vehiculo.valor_cuota,
            deuda_total: vehiculo.deuda_total,
            deuda_cuotas: vehiculo.deuda_cuotas,
            deuda_multas: vehiculo.deuda_multas,
            fuente: vehiculo.fuente || "railweb",
          }
        : null,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Error al registrar la tarifa";
    const repetida = raw.startsWith("REPETIDA|");
    const msg = repetida ? raw.slice("REPETIDA|".length) : raw;
    return NextResponse.json(
      {
        error: msg,
        repetida,
        placa: placaIngresada || undefined,
      },
      { status: 400 },
    );
  }
}
