import { NextResponse } from "next/server";

import {
  categoriaMorosoEstable,
  clasificarCategoriaMoroso,
  esCategoriaMoroso,
  type CategoriaMoroso,
} from "@/lib/categoriasMorosos";
import type {
  CasoCartera,
  GestionCartera,
  MorosoBandeja,
} from "@/lib/carteraMorososTypes";
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

    const [{ atrasos }, casosRes, gestionesRes] = await Promise.all([
      fetchAtrasosDesdeDb(refresh),
      supabase.from("cartera_casos").select(
        "placa, perfil_id, categoria, status, notas, updated_at",
      ),
      supabase
        .from("cartera_gestiones")
        .select("id, placa, perfil_id, status, notas, monto, created_at")
        .order("created_at", { ascending: false })
        .limit(4000),
    ]);

    if (casosRes.error) {
      // Tablas aún no creadas: listado sigue sin seguimiento.
      console.warn("[api/cartera/morosos] cartera_casos:", casosRes.error.message);
    }
    type GestionRow = {
      id?: number | null;
      placa?: string | null;
      perfil_id?: string | null;
      status?: string | null;
      notas?: string | null;
      created_at?: string | null;
      monto?: number | null;
    };
    let gestionesRows: GestionRow[] | null =
      gestionesRes.data as GestionRow[] | null;
    if (gestionesRes.error) {
      if (/monto/i.test(gestionesRes.error.message)) {
        const retry = await supabase
          .from("cartera_gestiones")
          .select("id, placa, perfil_id, status, notas, created_at")
          .order("created_at", { ascending: false })
          .limit(4000);
        if (retry.error) {
          console.warn(
            "[api/cartera/morosos] cartera_gestiones:",
            retry.error.message,
          );
        } else {
          gestionesRows = retry.data as GestionRow[] | null;
        }
      } else {
        console.warn(
          "[api/cartera/morosos] cartera_gestiones:",
          gestionesRes.error.message,
        );
      }
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

    const gestionesByPlaca = new Map<string, GestionCartera[]>();
    for (const row of gestionesRows ?? []) {
      const placa = String(row.placa ?? "")
        .toUpperCase()
        .replace(/\s/g, "");
      if (!placa) continue;
      const list = gestionesByPlaca.get(placa) ?? [];
      if (list.length >= 8) continue;
      list.push({
        id: Number(row.id) || undefined,
        placa,
        perfil_id: String(row.perfil_id ?? ""),
        status: String(row.status ?? ""),
        notas: row.notas ?? null,
        created_at: String(row.created_at ?? ""),
        monto:
          "monto" in row && row.monto != null && Number.isFinite(Number(row.monto))
            ? Number(row.monto)
            : null,
      });
      gestionesByPlaca.set(placa, list);
    }

    const conGps = await enriquecerConEstadoGps(atrasos);
    const categorias = emptyCategorias();
    const bandejasNuevas: Array<{ placa: string; categoria: CategoriaMoroso }> =
      [];

    for (const item of conGps) {
      if (item.deuda_total <= 0) continue;

      const placaKey = item.placa.toUpperCase().replace(/\s/g, "");
      const enVivo = clasificarCategoriaMoroso({
        dias_mora: item.dias_mora,
        deuda_total: item.deuda_total,
        total_pagado: item.total_pagado,
        cumplimiento_pct: item.cumplimiento_pct,
        ultimo_pago: item.ultimo_pago,
        gps: item.gps,
      });
      const caso = casosByPlaca.get(placaKey) ?? null;
      const categoria = categoriaMorosoEstable(caso?.categoria, enVivo);
      if (!categoria) continue;

      if (!esCategoriaMoroso(caso?.categoria)) {
        bandejasNuevas.push({ placa: placaKey, categoria });
      }

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
        caso,
        gestiones: gestionesByPlaca.get(placaKey) ?? [],
      };
      categorias[categoria].push(fila);
    }

    // ponytail: congelar bandeja en cartera_casos; no se pisa en cargas siguientes
    if (bandejasNuevas.length) {
      for (let i = 0; i < bandejasNuevas.length; i += 100) {
        const chunk = bandejasNuevas.slice(i, i + 100);
        const { error: errBandejas } = await supabase
          .from("cartera_casos")
          .upsert(
            chunk.map((b) => ({
              placa: b.placa,
              categoria: b.categoria,
              status: "pendiente",
            })),
            { onConflict: "placa", ignoreDuplicates: true },
          );
        if (errBandejas) {
          console.warn(
            "[api/cartera/morosos] fijar bandejas:",
            errBandejas.message,
          );
          break;
        }
      }
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
