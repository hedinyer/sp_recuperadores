import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

import { buscarPorPlaca, parseCsvPuntoComa } from "@/lib/csvPlaca";

export const runtime = "nodejs";

function defaultLocalCsvPath(): string {
  return path.join(process.cwd(), "..", "data", "reporte_clientes_actual.csv");
}

async function leerContenidoCsv(): Promise<string> {
  const url = process.env.REPORTE_CSV_URL;
  if (url?.trim()) {
    const res = await fetch(url, {
      next: { revalidate: 120 },
      headers: { Accept: "text/csv,text/plain,*/*" },
    });
    if (!res.ok) {
      throw new Error(`No se pudo descargar REPORTE_CSV_URL (${res.status})`);
    }
    return res.text();
  }

  const filePath =
    process.env.REPORTE_CSV_PATH?.trim() || defaultLocalCsvPath();
  return fs.readFile(filePath, "utf-8");
}

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
    const raw = await leerContenidoCsv();
    const rows = parseCsvPuntoComa(raw);
    if (!rows.length) {
      return NextResponse.json(
        { error: "El CSV está vacío o no es válido" },
        { status: 503 },
      );
    }
    const vehiculo = buscarPorPlaca(rows, placa);
    if (!vehiculo) {
      return NextResponse.json(
        { error: "No se encontró la placa", placa: placa.toUpperCase() },
        { status: 404 },
      );
    }
    return NextResponse.json({ vehiculo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error leyendo datos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
