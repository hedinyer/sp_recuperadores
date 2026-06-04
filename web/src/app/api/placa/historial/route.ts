import { NextResponse } from "next/server";

import { obtenerHistorialPlaca } from "@/lib/historialPlaca";

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
    const { items, cedula } = await obtenerHistorialPlaca(placa);
    return NextResponse.json({ items, cedula });
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : e &&
            typeof e === "object" &&
            "message" in e &&
            typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Error al cargar historial";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
