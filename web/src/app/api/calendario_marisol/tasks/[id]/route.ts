import { NextResponse } from "next/server";

import {
  calendarioTokenConfigured,
  calendarioTokenOk,
} from "@/lib/calendarioMarisol";
import {
  deleteSkylightTask,
  updateSkylightTask,
} from "@/lib/skylightClient";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function misconfigured() {
  return NextResponse.json(
    { error: "CALENDARIO_MARISOL_TOKEN no configurado" },
    { status: 503 },
  );
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(request)) return unauthorized();
    const { id } = await ctx.params;
    const body = await request.json();
    const task = await updateSkylightTask(id, body);
    return NextResponse.json({ task });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar task";
    const status = /requerido|vacío|Nada/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(_request)) return unauthorized();
    const { id } = await ctx.params;
    await deleteSkylightTask(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al borrar task";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
