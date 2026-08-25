import { NextResponse } from "next/server";

import { calcularEfectividad } from "@/lib/carteraEfectividad";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const placaRaw = searchParams.get("placa")?.trim() ?? "";
    const placa = placaRaw ? normalizarPlaca(placaRaw) : undefined;

    const data = await calcularEfectividad(placa ? { placa } : undefined);
    return NextResponse.json(data);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al calcular efectividad";
    console.error("[api/cartera/efectividad]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
