import { NextResponse } from "next/server";

import {
  calendarioTokenConfigured,
  calendarioTokenOk,
} from "@/lib/calendarioMarisol";
import {
  createSkylightTask,
  listSkylightTasks,
} from "@/lib/skylightClient";

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
    const tasks = await listSkylightTasks();
    return NextResponse.json({ tasks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al listar tasks";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(request)) return unauthorized();
    const body = await request.json();
    const task = await createSkylightTask(body);
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear task";
    const status = /requerido|vacío/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
