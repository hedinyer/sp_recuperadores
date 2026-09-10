/**
 * SQL compartido: solo la parte del pago que abona `tarifa`.
 * Facturas mixtas (pago_inicial / abono_credito / multa como ítem) se prorratean
 * por `tarifa_subtotal / total` para no inflar cuotas pagadas.
 *
 * `pagomulta` solo se resta si la factura no trae ítem `multa` (evita doble descuento).
 */
export const SQL_JOINS_PAGO_TARIFA = `
  LEFT JOIN (
    SELECT factura_id, SUM(subtotal::numeric) AS tarifa_subtotal
    FROM terminal_pagos_itemfactura
    WHERE tipo_item = 'tarifa'
    GROUP BY factura_id
  ) ti ON ti.factura_id = f.id
  LEFT JOIN (
    SELECT factura_id, SUM(subtotal::numeric) AS multa_item_subtotal
    FROM terminal_pagos_itemfactura
    WHERE tipo_item = 'multa'
    GROUP BY factura_id
  ) mi ON mi.factura_id = f.id
  LEFT JOIN terminal_pagos_canalpago cp ON cp.id = pf.canal_id
  LEFT JOIN terminal_pagos_mediopago mp ON mp.id = cp.medio_id
  LEFT JOIN (
    SELECT factura_id, SUM(valor::numeric) AS valor_multa
    FROM terminal_pagos_pagomulta
    GROUP BY factura_id
  ) pm ON pm.factura_id = f.id
`;

/** Expresión numérica del valor atribuible a cuota (puede ser <= 0). */
export const SQL_EXPR_VALOR_CUOTA = `
  pf.valor::numeric
    * (COALESCE(ti.tarifa_subtotal, 0) / NULLIF(f.total::numeric, 0))
    - CASE
        WHEN ROW_NUMBER() OVER (
          PARTITION BY f.id ORDER BY pf.fecha_pago, pf.id
        ) = 1
        AND COALESCE(mi.multa_item_subtotal, 0) = 0
        THEN COALESCE(pm.valor_multa, 0)
        ELSE 0
      END
`;

export const SQL_FILTRO_PAGO_TARIFA = `
  lower(f.estado) <> 'anulada'
  AND COALESCE(ti.tarifa_subtotal, 0) > 0
  AND f.total::numeric > 0
  AND NOT (
    pf.valor::numeric = 25000
    AND lower(COALESCE(mp.nombre, '')) = 'dale'
  )
`;
