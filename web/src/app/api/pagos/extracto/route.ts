import { NextResponse } from "next/server";

import { parseExtractoBuffer } from "@/lib/pagosExtracto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8_000_000;

export async function POST(request: Request) {
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Envía el Excel como multipart (campo file)" },
        { status: 400 },
      );
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Elige un Excel .xlsx" },
        { status: 400 },
      );
    }
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Elige un Excel .xlsx" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "El archivo es demasiado grande (máx 8 MB)" },
        { status: 413 },
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseExtractoBuffer(buf);
    return NextResponse.json({
      ok: true,
      archivo: file.name,
      ...parsed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al leer el Excel";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
