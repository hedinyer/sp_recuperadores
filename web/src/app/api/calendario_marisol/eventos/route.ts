import { NextResponse } from "next/server";

import {
  calendarioTokenConfigured,
  calendarioTokenOk,
  createEvento,
  listEventos,
} from "@/lib/calendarioMarisol";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function misconfigured() {
  return NextResponse.json(
    { error: "CALENDARIO_MARISOL_TOKEN no configurado" },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(request)) return unauthorized();
    const eventos = await listEventos();
    return NextResponse.json({ eventos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al listar eventos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(request)) return unauthorized();
    const body = await request.json();
    const evento = await createEvento(body);
    return NextResponse.json({ evento }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear evento";
    const status = /requerido|inválido|vacío|dtend/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
