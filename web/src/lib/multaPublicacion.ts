import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import { invalidarCachePlaca } from "@/lib/vehiculoPorPlaca";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

/** Multa estándar al publicar placa para recuperación (ERP). */
export const MULTA_PUBLICACION_COP = 25_000;

const OBSERVACION_MULTA = "Publicación recuperación";

const SQL_CONTRATO_POR_PLACA = `
SELECT ct.id AS contrato_id
FROM arrendamientos_contrato ct
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
WHERE ct.estado = 'Activo'
  AND ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND upper(replace(v.placa, ' ', '')) = $1
LIMIT 1
`;

const SQL_INSERT_MULTA = `
INSERT INTO terminal_pagos_multa
  (valor, fecha, observacion, estado, created_at, contrato_id, saldo)
VALUES ($1, CURRENT_DATE, $2, 'pendiente', NOW(), $3, $1)
RETURNING id
`;

export type ResultadoMultaPublicacion = {
  creada: boolean;
  monto: number;
  motivo?: string;
  multa_id?: number;
};

/** Registra multa de $25.000 en el ERP al publicar placa. */
export async function registrarMultaPublicacionPlaca(
  placa: string,
): Promise<ResultadoMultaPublicacion> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm) {
    return { creada: false, monto: 0, motivo: "placa_invalida" };
  }

  let lastError: string | undefined;

  for (const url of getDatabaseUrls()) {
    try {
      const contratos = await queryPg<{ contrato_id: string | number }>(
        url,
        SQL_CONTRATO_POR_PLACA,
        [placaNorm],
      );
      const contratoId = contratos[0]?.contrato_id;
      if (!contratoId) continue;

      const inserted = await queryPg<{ id: string | number }>(
        url,
        SQL_INSERT_MULTA,
        [MULTA_PUBLICACION_COP, OBSERVACION_MULTA, contratoId],
      );

      invalidarCachePlaca(placaNorm);
      return {
        creada: true,
        monto: MULTA_PUBLICACION_COP,
        multa_id: Number(inserted[0]?.id),
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn("[multaPublicacion] Error en una base:", lastError);
    }
  }

  return {
    creada: false,
    monto: MULTA_PUBLICACION_COP,
    motivo: lastError ?? "contrato_no_encontrado",
  };
}
