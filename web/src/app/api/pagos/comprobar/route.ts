import { NextResponse } from "next/server";

import { comprobarPagoHarness } from "@/lib/pagosHarness";
import type { MovimientoExtracto } from "@/lib/pagosExtracto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BODY = 6_000_000;
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY) {
      return NextResponse.json(
        { error: "Adjunto demasiado grande (máx ~4 MB)" },
        { status: 413 },
      );
    }
    const body = JSON.parse(rawBody) as {
      image_data_url?: string;
      movimientos?: MovimientoExtracto[];
      usados?: string[];
    };

    const image = String(body.image_data_url ?? "").trim();
    if (!DATA_URL_RE.test(image) || image.length > 2_500_000) {
      return NextResponse.json(
        { error: "Sube una imagen de comprobante (JPEG/PNG)" },
        { status: 400 },
      );
    }
    const movimientos = Array.isArray(body.movimientos)
      ? body.movimientos
      : [];
    if (!movimientos.length) {
      return NextResponse.json(
        { error: "Carga el extracto del banco antes de comprobar" },
        { status: 400 },
      );
    }

    // Sanitizar filas (cliente puede mandar basura)
    const clean: MovimientoExtracto[] = [];
    for (const m of movimientos.slice(0, 2000)) {
      if (!m || typeof m !== "object") continue;
      const monto = Number(m.monto_cop);
      const fecha = String(m.fecha ?? "");
      const hora = String(m.hora ?? "");
      if (!Number.isFinite(monto) || monto <= 0 || !fecha || !hora) continue;
      clean.push({
        id: String(m.id ?? `${m.documento}|${fecha}|${hora}`),
        fecha,
        hora,
        monto_cop: Math.round(monto),
        documento: String(m.documento ?? ""),
        transaccion: String(m.transaccion ?? ""),
        oficina: String(m.oficina ?? ""),
        referencia2: String(m.referencia2 ?? ""),
        motivo: String(m.motivo ?? ""),
      });
    }
    if (!clean.length) {
      return NextResponse.json(
        { error: "El extracto no tiene movimientos de ingreso válidos" },
        { status: 400 },
      );
    }

    const usados = Array.isArray(body.usados)
      ? body.usados.map(String).slice(0, 2000)
      : [];

    const result = await comprobarPagoHarness({
      imageDataUrl: image,
      movimientos: clean,
      usados,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al comprobar el pago";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
