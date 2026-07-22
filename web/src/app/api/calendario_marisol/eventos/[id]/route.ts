import { NextResponse } from "next/server";

import {
  calendarioTokenConfigured,
  calendarioTokenOk,
  deleteEvento,
  updateEvento,
} from "@/lib/calendarioMarisol";

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
    const evento = await updateEvento(id, body);
    if (!evento) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ evento });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    const status = /requerido|inválido|vacío|Nada/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(request)) return unauthorized();
    const { id } = await ctx.params;
    const ok = await deleteEvento(id);
    if (!ok) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al borrar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
