/** Tipos compartidos de ventas (sin deps de Node/pg — seguro en cliente). */

export type SedeId = "bga" | "girardot" | "bogota" | "railweb";

export type VentanaDias = 7 | 15 | 30 | 60 | 90 | 120;

export type VentaFila = {
  id: string;
  sede: SedeId;
  sede_label: string;
  tipo: "contado" | "credito";
  fecha: string;
  placa: string | null;
  modelo: string | null;
  color: string | null;
  frecuencia: string | null;
  cliente: string | null;
  /** Contado: valor_venta. Crédito: estimado contrato. */
  valor: number;
  valor_label: string;
  /** Solo crédito: cuota inicial. */
  inicial?: number;
  /** Solo crédito: monto cuota del periodo. */
  cuota_periodo?: number;
};

export type TotalesKpi = {
  contado_n: number;
  contado_valor: number;
  credito_n: number;
  credito_valor_sp: number;
  credito_valor_railweb: number;
  credito_estimado_total: number;
  credito_inicial_total: number;
  total_n: number;
};
