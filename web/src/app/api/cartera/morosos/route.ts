import { NextResponse } from "next/server";

import {
  clasificarCategoriaMoroso,
  type CategoriaMoroso,
} from "@/lib/categoriasMorosos";
import type { CasoCartera, MorosoBandeja } from "@/lib/carteraMorososTypes";
import { fetchAtrasosDesdeDb } from "@/lib/atrasosFromDb";
import { enriquecerConEstadoGps } from "@/lib/gpsEstadoPlacas";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CategoriasMap = Record<CategoriaMoroso, MorosoBandeja[]>;

function emptyCategorias(): CategoriasMap {
  return {
    bajo_pago: [],
    sin_gps: [],
    mora_15: [],
    mora_4_15: [],
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";

    const [{ atrasos }, casosRes] = await Promise.all([
      fetchAtrasosDesdeDb(refresh),
      supabase.from("cartera_casos").select(
        "placa, perfil_id, categoria, status, notas, updated_at",
      ),
    ]);

    if (casosRes.error) {
      // Tablas aún no creadas: listado sigue sin seguimiento.
      console.warn("[api/cartera/morosos] cartera_casos:", casosRes.error.message);
    }

    const casosByPlaca = new Map<string, CasoCartera>();
    for (const row of casosRes.data ?? []) {
      const placa = String(row.placa ?? "")
        .toUpperCase()
        .replace(/\s/g, "");
      if (!placa) continue;
      casosByPlaca.set(placa, {
        placa,
        perfil_id: row.perfil_id ?? null,
        categoria: row.categoria ?? null,
        status: row.status ?? "pendiente",
        notas: row.notas ?? null,
        updated_at: row.updated_at ?? null,
      });
    }

    const conGps = await enriquecerConEstadoGps(atrasos);
    const categorias = emptyCategorias();

    for (const item of conGps) {
      const categoria = clasificarCategoriaMoroso({
        dias_mora: item.dias_mora,
        deuda_total: item.deuda_total,
        total_pagado: item.total_pagado,
        cumplimiento_pct: item.cumplimiento_pct,
        ultimo_pago: item.ultimo_pago,
        gps: item.gps,
      });
      if (!categoria) continue;

      const placaKey = item.placa.toUpperCase().replace(/\s/g, "");
      const fila: MorosoBandeja = {
        placa: placaKey,
        cedula: item.cedula,
        nombre: item.nombre,
        telefono: item.telefono,
        visitador: item.visitador,
        fecha_inicio: item.fecha_inicio,
        valor_cuota: item.valor_cuota,
        deuda_total: item.deuda_total,
        dias_mora: item.dias_mora,
        cuotas_pendientes: item.cuotas_pendientes,
        cumplimiento_pct: item.cumplimiento_pct,
        total_pagado: item.total_pagado,
        ultimo_pago: item.ultimo_pago,
        pago_hoy: item.pago_hoy,
        categoria,
        gps: item.gps,
        caso: casosByPlaca.get(placaKey) ?? null,
      };
      categorias[categoria].push(fila);
    }

    const counts = {
      bajo_pago: categorias.bajo_pago.length,
      sin_gps: categorias.sin_gps.length,
      mora_15: categorias.mora_15.length,
      mora_4_15: categorias.mora_4_15.length,
    };
    const total =
      counts.bajo_pago + counts.sin_gps + counts.mora_15 + counts.mora_4_15;
    const deuda_total = (
      Object.values(categorias) as MorosoBandeja[][]
    ).reduce(
      (sum, lista) => sum + lista.reduce((s, m) => s + m.deuda_total, 0),
      0,
    );

    return NextResponse.json({
      categorias,
      resumen: {
        total,
        counts,
        deuda_total,
        generado_en: new Date().toISOString(),
      },
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al cargar morosos por categoría";
    console.error("[api/cartera/morosos]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
