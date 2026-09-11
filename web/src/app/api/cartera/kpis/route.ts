import { NextResponse } from "next/server";

import {
  isoInicioDiaBogota,
  kpisDesdeGestiones,
  PERFILES_KPI,
  type FilaGestionKpi,
  type PerfilKpiId,
} from "@/lib/carteraKpis";
import { obtenerLoteActivoOUltimo } from "@/lib/carteraLotes17";
import { fetchPagosErpPorPlacas } from "@/lib/reporteFromDb";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ymdBogota(ms = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("cartera_gestiones")
      .select("perfil_id, status, placa, created_at, notas, monto")
      .in("perfil_id", [...PERFILES_KPI])
      .gte("created_at", isoInicioDiaBogota())
      .order("created_at", { ascending: false })
      .limit(2000);

    type RowKpi = {
      perfil_id?: string | null;
      status?: string | null;
      placa?: string | null;
      created_at?: string | null;
      notas?: string | null;
      monto?: number | null;
    };
    let rows: RowKpi[] | null = data as RowKpi[] | null;
    if (error && /monto/i.test(error.message)) {
      const retry = await supabase
        .from("cartera_gestiones")
        .select("perfil_id, status, placa, created_at, notas")
        .in("perfil_id", [...PERFILES_KPI])
        .gte("created_at", isoInicioDiaBogota())
        .order("created_at", { ascending: false })
        .limit(2000);
      if (retry.error) {
        return NextResponse.json(
          { error: retry.error.message },
          { status: 500 },
        );
      }
      rows = retry.data as RowKpi[] | null;
    } else if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const filas: FilaGestionKpi[] = (rows ?? []).map((row) => ({
      perfil_id: String(row.perfil_id ?? ""),
      status: String(row.status ?? ""),
      placa: String(row.placa ?? "")
        .toUpperCase()
        .replace(/\s/g, ""),
      created_at: String(row.created_at ?? ""),
      notas: row.notas ?? null,
      monto:
        row.monto != null && Number.isFinite(Number(row.monto))
          ? Number(row.monto)
          : null,
    }));

    const { kpis, recaudado_equipo } = kpisDesdeGestiones(filas);

    // Pagos ERP de hoy en placas fijas del lote 17+ (ventana de 4 días)
    try {
      const { activo } = await obtenerLoteActivoOUltimo("cuotas_17");
      if (activo) {
        const { data: asignadas } = await supabase
          .from("cartera_lote_placas")
          .select("placa, perfil_id")
          .eq("lote_id", activo.id)
          .in("perfil_id", [...PERFILES_KPI]);

        const asignacion = new Map<string, PerfilKpiId>();
        for (const row of asignadas ?? []) {
          const placa = String(row.placa ?? "")
            .toUpperCase()
            .replace(/\s/g, "");
          const perfil = row.perfil_id as PerfilKpiId;
          if (placa && PERFILES_KPI.includes(perfil)) {
            asignacion.set(placa, perfil);
          }
        }

        const hoy = ymdBogota();
        const enVentana =
          hoy >= ymdBogota(new Date(activo.starts_at).getTime()) &&
          hoy <= ymdBogota(new Date(activo.ends_at).getTime());

        if (enVentana && asignacion.size) {
          const pagos = await fetchPagosErpPorPlacas(
            [...asignacion.keys()],
            hoy,
            hoy,
          );

          for (const kpi of kpis) {
            const placasAbono = new Set(
              filas
                .filter(
                  (f) =>
                    f.perfil_id === kpi.id &&
                    (f.status === "abono" || (f.monto ?? 0) > 0),
                )
                .map((f) => f.placa),
            );
            let sumErp = 0;
            let motosNuevas = 0;
            for (const p of pagos) {
              if (asignacion.get(p.placa) !== kpi.id) continue;
              if (placasAbono.has(p.placa)) continue;
              sumErp += p.monto;
              motosNuevas += 1;
            }
            kpi.recaudado_hoy += sumErp;
            kpi.motos_hoy += motosNuevas;
          }
        }
      }
    } catch (e) {
      console.warn(
        "[kpis] pagos ERP lote:",
        e instanceof Error ? e.message : e,
      );
    }

    const recaudado = kpis.reduce((s, k) => s + k.recaudado_hoy, 0);

    return NextResponse.json({
      kpis,
      recaudado_equipo: recaudado || recaudado_equipo,
      generado_en: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar KPIs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
