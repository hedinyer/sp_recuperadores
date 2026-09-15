import { NextResponse } from "next/server";

import {
  parseExtractoFlexible,
  type MovimientoExtracto,
} from "@/lib/pagosExtracto";
import { uploadExtractoSpark } from "@/lib/pagosOcrClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MAX_BYTES = 8_000_000;
const MAX_FILES = 30;

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
    const files = form
      .getAll("file")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) {
      return NextResponse.json(
        { error: "Elige uno o más Excel .xlsx" },
        { status: 400 },
      );
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Máximo ${MAX_FILES} archivos por carga` },
        { status: 400 },
      );
    }

    const byId = new Map<string, MovimientoExtracto>();
    const archivos: string[] = [];
    const sparkIds: string[] = [];
    const fechasSet = new Set<string>();
    let total_filas = 0;
    let viaAgente = false;
    let sinHora = false;
    let sparkError: string | null = null;

    for (const file of files) {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
        return NextResponse.json(
          { error: `"${file.name}" no es un Excel .xlsx` },
          { status: 400 },
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `"${file.name}" es demasiado grande (máx 8 MB)` },
          { status: 413 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const parsed = await parseExtractoFlexible(buf);
      total_filas += parsed.total_filas;
      if (parsed.via === "agente") viaAgente = true;
      if (parsed.sin_hora) sinHora = true;
      for (const m of parsed.movimientos) {
        if (!byId.has(m.id)) byId.set(m.id, m);
        if (/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) fechasSet.add(m.fecha);
      }
      archivos.push(file.name);

      try {
        const spark = await uploadExtractoSpark({
          bytes: buf,
          filename: file.name,
          activar: true,
        });
        if (spark?.id) sparkIds.push(spark.id);
      } catch (e) {
        sparkError =
          e instanceof Error
            ? e.message
            : "No se pudo guardar el extracto en la Spark";
      }
    }

    const movimientos = Array.from(byId.values());
    const fechas = Array.from(fechasSet).sort();
    return NextResponse.json({
      ok: true,
      archivo: archivos.join(", "),
      archivos,
      movimientos,
      total_filas,
      ingresos: movimientos.length,
      via: viaAgente ? "agente" : "reglas",
      sin_hora: sinHora,
      spark_ids: sparkIds,
      spark_id: sparkIds[sparkIds.length - 1] ?? null,
      fechas,
      fecha_min: fechas[0] ?? null,
      fecha_max: fechas[fechas.length - 1] ?? null,
      spark_error: sparkError,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al leer el Excel";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
