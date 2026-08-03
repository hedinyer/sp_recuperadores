import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import { invalidarCachePlaca } from "@/lib/vehiculoPorPlaca";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

/** Multa al publicar placa — Bucaramanga (default). */
export const MULTA_PUBLICACION_COP = 25_000;
/** Multa al publicar placa — Bogotá. */
export const MULTA_PUBLICACION_BOGOTA_COP = 100_000;

export type CiudadPublicacion = "bucaramanga" | "bogota";

export function montoMultaPorCiudad(ciudad: CiudadPublicacion): number {
  return ciudad === "bogota"
    ? MULTA_PUBLICACION_BOGOTA_COP
    : MULTA_PUBLICACION_COP;
}

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

/** Registra multa de publicación en el ERP ($25.000 o $100.000 según ciudad). */
export async function registrarMultaPublicacionPlaca(
  placa: string,
  monto: number = MULTA_PUBLICACION_COP,
): Promise<ResultadoMultaPublicacion> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm) {
    return { creada: false, monto: 0, motivo: "placa_invalida" };
  }

  const montoFinal =
    Number.isFinite(monto) && monto > 0
      ? Math.round(monto)
      : MULTA_PUBLICACION_COP;

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
        [montoFinal, OBSERVACION_MULTA, contratoId],
      );

      invalidarCachePlaca(placaNorm);
      return {
        creada: true,
        monto: montoFinal,
        multa_id: Number(inserted[0]?.id),
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn("[multaPublicacion] Error en una base:", lastError);
    }
  }

  return {
    creada: false,
    monto: montoFinal,
    motivo: lastError ?? "contrato_no_encontrado",
  };
}
