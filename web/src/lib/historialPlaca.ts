import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import { fetchVehiculoPorPlaca } from "@/lib/vehiculoPorPlaca";
import { supabase } from "@/lib/supabase";
import { etiquetaRecuperador } from "@/lib/recuperadores";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

export type ItemHistorialPlaca = {
  id: string;
  fecha: string;
  categoria: "cobro" | "recogida";
  titulo: string;
  subtitulo?: string;
  monto?: number;
};

const SQL_REGISTROS_PLACA = `
SELECT
    pf.fecha_pago::timestamptz AS fecha_registro,
    pf.valor::numeric AS valor,
    COALESCE(mp.nombre, '') AS tipo,
    pf.referencia
FROM terminal_pagos_pagofactura pf
JOIN terminal_pagos_factura f ON f.id = pf.factura_id
JOIN arrendamientos_contrato ct ON ct.id = f.contrato_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
LEFT JOIN terminal_pagos_canalpago cp ON cp.id = pf.canal_id
LEFT JOIN terminal_pagos_mediopago mp ON mp.id = cp.medio_id
WHERE upper(replace(v.placa, ' ', '')) = $1
ORDER BY pf.fecha_pago DESC
LIMIT 80
`;

async function registrosCobroPorPlaca(
  placa: string,
): Promise<ItemHistorialPlaca[]> {
  const placaNorm = normalizarPlaca(placa);
  const vistos = new Set<string>();
  const items: ItemHistorialPlaca[] = [];

  for (const connectionString of getDatabaseUrls()) {
    try {
      const rows = await queryPg<{
        fecha_registro: Date;
        valor: string | number;
        tipo: string | null;
        referencia: string | null;
      }>(connectionString, SQL_REGISTROS_PLACA, [placaNorm]);

      for (const row of rows) {
        if (row.fecha_registro == null || row.valor == null) continue;
        const fecha = new Date(row.fecha_registro).toISOString();
        const monto = Math.round(Number(row.valor));
        const ref = (row.referencia ?? "").trim();
        const tipo = (row.tipo ?? "").trim();
        const key = `${fecha}|${monto}|${ref}|${tipo}`;
        if (vistos.has(key)) continue;
        vistos.add(key);

        const partes: string[] = [];
        if (tipo) partes.push(tipo);
        if (ref) partes.push(`Ref. ${ref}`);

        items.push({
          id: `reg-${key}`,
          fecha,
          categoria: "cobro",
          titulo: "Cobro registrado",
          subtitulo: partes.length ? partes.join(" · ") : undefined,
          monto,
        });
      }
    } catch {
      // siguiente base
    }
  }

  return items;
}

async function eventosRecuperadores(
  placa: string,
): Promise<ItemHistorialPlaca[]> {
  const placaNorm = normalizarPlaca(placa);
  const { data, error } = await supabase
    .from("recuperadores")
    .select(
      "id, placa_asignada, estado_moto, Pagado, multa, nombre_recuperador, tipo_pago, presencial, fecha_hora_asignada, fecha_hora_recuperada",
    )
    .order("fecha_hora_asignada", { ascending: false })
    .limit(40);

  if (error) throw error;

  const items: ItemHistorialPlaca[] = [];

  for (const row of data ?? []) {
    const rowPlaca = normalizarPlaca(String(row.placa_asignada ?? ""));
    if (rowPlaca !== placaNorm) continue;

    const estado = String(row.estado_moto ?? "")
      .trim()
      .toLowerCase();
    const pagado = Number(row.Pagado) || 0;
    const multa = Number(row.multa) || 0;
    const recuperador = String(row.nombre_recuperador ?? "").trim();
    const tipoPago = row.tipo_pago ? String(row.tipo_pago).trim() : "";
    const presencial =
      row.presencial === true
        ? "Presencial"
        : row.presencial === false
          ? "Remoto"
          : "";

    if (estado === "recuperada") {
      const fecha =
        row.fecha_hora_recuperada || row.fecha_hora_asignada || "";
      if (!fecha) continue;
      items.push({
        id: `rec-${row.id}-recuperada`,
        fecha: new Date(fecha).toISOString(),
        categoria: "recogida",
        titulo: "Moto recuperada",
        subtitulo: recuperador
          ? etiquetaRecuperador(recuperador)
          : undefined,
      });
      continue;
    }

    const esAbono =
      estado === "abonó" ||
      estado === "abono" ||
      pagado > 0;
    if (!esAbono) continue;

    const fecha = row.fecha_hora_asignada;
    if (!fecha) continue;

    const partes: string[] = [];
    if (recuperador) partes.push(etiquetaRecuperador(recuperador));
    if (tipoPago) partes.push(tipoPago);
    if (presencial) partes.push(presencial);
    if (multa > 0) partes.push(`Multa ${multa.toLocaleString("es-CO")}`);

    items.push({
      id: `rec-${row.id}-abono`,
      fecha: new Date(fecha).toISOString(),
      categoria: "cobro",
      titulo: "Pago con recuperador",
      subtitulo: partes.length ? partes.join(" · ") : undefined,
      monto: pagado > 0 ? pagado : undefined,
    });
  }

  return items;
}

export async function obtenerHistorialPlaca(
  placa: string,
): Promise<{ items: ItemHistorialPlaca[]; cedula?: string }> {
  const placaNorm = normalizarPlaca(placa);
  const vehiculo = await fetchVehiculoPorPlaca(placaNorm);
  if (!vehiculo) {
    return { items: [] };
  }

  const cedula = (vehiculo.cedula ?? "").trim();

  const [cobrosDb, eventosRec] = await Promise.all([
    registrosCobroPorPlaca(placaNorm),
    eventosRecuperadores(placaNorm),
  ]);

  const items = [...cobrosDb, ...eventosRec].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );

  return { items, cedula: cedula || undefined };
}
