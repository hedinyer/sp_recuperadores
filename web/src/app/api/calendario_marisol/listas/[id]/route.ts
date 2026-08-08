import { NextResponse } from "next/server";

import {
  calendarioTokenConfigured,
  calendarioTokenOk,
} from "@/lib/calendarioMarisol";
import {
  addSkylightListItem,
  deleteSkylightList,
  listSkylightListItems,
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

export async function GET(request: Request, ctx: Ctx) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(request)) return unauthorized();
    const { id } = await ctx.params;
    const items = await listSkylightListItems(id);
    return NextResponse.json({ list_id: id, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al listar ítems";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(request)) return unauthorized();
    const { id } = await ctx.params;
    const body = await request.json();
    const item = await addSkylightListItem(id, body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al agregar ítem";
    const status = /requerido|vacío/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(_request)) return unauthorized();
    const { id } = await ctx.params;
    await deleteSkylightList(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al borrar lista";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
