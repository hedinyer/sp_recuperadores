/**
 * Corre el harness de /informe-cartera contra ERP + SP + GPS.
 */
import {
  calcularMetricasExtracto,
  parseDiasCredito,
  type RegistroExtracto,
} from "@/lib/extractoCliente";
import { cargarMapaGpsUnificado } from "@/lib/gpsEstadoPlacas";
import {
  armarCorte,
  bucketMora,
  clasificarZonaErp,
  esCarteraInformeActiva,
  esCompraSpEnCalle,
  esPlacaInforme,
  placaYaContada,
  posicionGpsPlaca,
  registrarPlacas,
  sumarMoto,
  zonasVacias,
  type InformeCarteraCorte,
  type ZonaId,
} from "@/lib/informeCartera";
import { getDatabaseUrls } from "@/lib/dbUrls";
import { getPgPool, queryPg } from "@/lib/pgPool";
import {
  SQL_REGISTROS_EXTRACTO,
  fetchFreezeDaysPorContrato,
} from "@/lib/reporteFromDb";
import { clientSedeSp, type SedeSpId } from "@/lib/spSedes";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import { fetchMultasPendientesPorContrato } from "@/lib/vehiculoPorPlaca";

const SQL_ACTIVOS = `
SELECT
    ct.id AS contrato_id,
    cl.nombre,
    cl.direccion,
    v.placa,
    ct.fecha_inicio::date AS fecha_inicio,
    ct.tarifa::numeric AS valor_cuota,
    ct.dias_contrato::text AS fecha_final,
    ct.estado,
    v.estado AS estado_vehiculo
FROM arrendamientos_contrato ct
JOIN clientes_cliente cl ON cl.id = ct.cliente_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
WHERE ct.estado = 'Activo'
  AND v.estado = 'Activo'
  AND ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND v.placa IS NOT NULL
  AND TRIM(v.placa) <> ''
`;

const SQL_TALLER = `
SELECT COALESCE(SUM(cr.saldo), 0) AS taller
FROM creditos_credito cr
JOIN arrendamientos_contrato ct ON ct.id = cr.contrato_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
WHERE ct.estado = 'Activo'
  AND v.estado = 'Activo'
  AND cr.estado = 'Activo'
  AND cr.saldo > 0
`;

type ContratoRow = {
  contrato_id: string | number;
  nombre: string | null;
  direccion: string | null;
  placa: string;
  fecha_inicio: Date | string;
  valor_cuota: string | number;
  fecha_final: string | null;
  estado: string | null;
  estado_vehiculo: string | null;
};

type PagoRow = {
  contrato_id: string | number;
  fecha_registro: Date;
  valor: string | number;
  tipo: string | null;
  referencia: string | null;
};

type CompraSp = {
  id?: string;
  placa?: string | null;
  estado?: string | null;
  estado_fisico?: string | null;
};

type AtrasoSp = {
  user_moto_compra_id?: string;
  monto_adeudado?: number | null;
  dias_atraso?: number | null;
};

async function fetchAllSp<T>(
  sede: SedeSpId,
  tabla: string,
  columnas: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aplicar?: (q: any) => any,
): Promise<T[]> {
  const sb = clientSedeSp(sede);
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; from < 20_000; from += page) {
    let q = sb.from(tabla).select(columnas).range(from, from + page - 1);
    if (aplicar) q = aplicar(q);
    const { data, error } = await q;
    if (error) throw new Error(`${sede} ${tabla}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function asDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T00:00:00`);
}

function registrosPorContrato(rows: PagoRow[]): Map<string, RegistroExtracto[]> {
  const map = new Map<string, RegistroExtracto[]>();
  for (const row of rows) {
    if (row.fecha_registro == null || row.valor == null) continue;
    const key = String(row.contrato_id);
    const lista = map.get(key) ?? [];
    lista.push({
      fecha: new Date(row.fecha_registro),
      valor: Number(row.valor),
      tipo: row.tipo ?? "",
      referencia: row.referencia ?? "",
    });
    map.set(key, lista);
  }
  return map;
}

async function carteraSp(
  sede: SedeSpId,
  omitir?: Set<string>,
): Promise<{ totales: ReturnType<typeof zonasVacias>["calle_80"]; placas: Set<string> }> {
  const [compras, atrasos] = await Promise.all([
    fetchAllSp<CompraSp>(
      sede,
      "user_moto_compra",
      "id, placa, estado, estado_fisico",
      (q) => q.eq("estado", "entregada"),
    ),
    fetchAllSp<AtrasoSp>(
      sede,
      "atrasos",
      "user_moto_compra_id, monto_adeudado, dias_atraso",
    ),
  ]);
  const atrasoBy = new Map<string, AtrasoSp>();
  for (const a of atrasos) {
    const id = String(a.user_moto_compra_id ?? "");
    if (id) atrasoBy.set(id, a);
  }
  const totales = {
    motos: 0,
    cartera: 0,
    alDia: 0,
    mora1a7: 0,
    moraMas7: 0,
  };
  const placas = new Set<string>();
  for (const c of compras) {
    if (!esCompraSpEnCalle(c.estado, c.estado_fisico)) continue;
    if (!esPlacaInforme(c.placa ?? "")) continue;
    if (omitir && placaYaContada(c.placa, omitir)) continue;
    const atraso = atrasoBy.get(String(c.id ?? ""));
    const deuda = Math.round(Number(atraso?.monto_adeudado) || 0);
    const dm = Math.max(0, Number(atraso?.dias_atraso) || 0);
    sumarMoto(totales, deuda, bucketMora(dm, deuda));
    registrarPlacas(placas, c.placa);
  }
  return { totales, placas };
}

export type InformeCarteraMeta = {
  erp_incluidos: number;
  omitidas_sp: number;
  freeze_contratos: number;
  gps_keys: number;
};

export async function calcularInformeCarteraDesdeDb(
  ymd: string,
): Promise<{ corte: InformeCarteraCorte; meta: InformeCarteraMeta }> {
  const urls = getDatabaseUrls();
  const url = urls[0];
  if (!url) throw new Error("DATABASE_URL requerida");

  const fechaRef = startOfDay(new Date(`${ymd}T12:00:00-05:00`));
  const zonas = zonasVacias();

  const [contratos, pagos, freezeBy, multasBy, tallerRows, gps, calle80] =
    await Promise.all([
      queryPg<ContratoRow>(url, SQL_ACTIVOS),
      queryPg<PagoRow>(url, SQL_REGISTROS_EXTRACTO),
      fetchFreezeDaysPorContrato(url),
      fetchMultasPendientesPorContrato(url),
      queryPg<{ taller: string | number }>(url, SQL_TALLER),
      cargarMapaGpsUnificado(),
      carteraSp("bogota"),
    ]);
  const girardot = await carteraSp("girardot", calle80.placas);

  const regs = registrosPorContrato(pagos);
  const seen = new Set<string>();
  let freezeContratos = 0;
  let incluidos = 0;
  let omitidasSp = 0;

  for (const c of contratos) {
    if (!esCarteraInformeActiva(c.estado, c.estado_vehiculo)) continue;
    if (!esPlacaInforme(c.placa)) continue;
    const placa = normalizarPlaca(c.placa);
    if (seen.has(placa)) continue;
    if (
      placaYaContada(c.placa, calle80.placas) ||
      placaYaContada(c.placa, girardot.placas)
    ) {
      omitidasSp += 1;
      continue;
    }
    seen.add(placa);

    const cuota = Number(c.valor_cuota);
    if (!c.fecha_inicio || !(cuota > 0)) continue;

    const cid = String(c.contrato_id);
    const freeze = (freezeBy.get(cid) ?? []).filter((f) => f <= ymd);
    if (freeze.length) freezeContratos += 1;

    const metricas = calcularMetricasExtracto(
      asDate(c.fecha_inicio),
      cuota,
      regs.get(cid) ?? [],
      parseDiasCredito(c.fecha_final),
      fechaRef,
      freeze,
    );
    const deuda =
      Math.round(metricas.deuda_total) + (multasBy.get(cid) ?? 0);
    const zona = clasificarZonaErp({
      nombre: c.nombre ?? "",
      direccion: c.direccion,
      pos: posicionGpsPlaca(c.placa, gps),
    });
    sumarMoto(zonas[zona], deuda, bucketMora(metricas.dias_mora, deuda));
    incluidos += 1;
  }

  zonas.calle_80 = calle80.totales;
  zonas.girardot = girardot.totales;

  for (const id of Object.keys(zonas) as ZonaId[]) {
    zonas[id].cartera = Math.round(zonas[id].cartera);
  }

  return {
    corte: armarCorte({
      ymd,
      taller: Number(tallerRows[0]?.taller ?? 0),
      zonas,
    }),
    meta: {
      erp_incluidos: incluidos,
      omitidas_sp: omitidasSp,
      freeze_contratos: freezeContratos,
      gps_keys: gps.size,
    },
  };
}

export async function cerrarPoolsInforme(): Promise<void> {
  await Promise.all(getDatabaseUrls().map((url) => getPgPool(url).end()));
}
