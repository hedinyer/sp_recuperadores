export type TipoRecibo = "pago" | "recuperada";
export type MetodoPago = "Efectivo" | "Nequi" | "Transferencia";
export type PagoPaso = "montos" | "metodo" | "modalidad" | "foto";

export const METODOS_PAGO: MetodoPago[] = ["Efectivo", "Nequi", "Transferencia"];

export type ReciboData = {
  referencia: string;
  fecha: string;
  recuperador: string;
  cliente: string;
  cedula: string;
  placa: string;
  montoPago: number;
  montoMulta: number;
  total: number;
  tipo: TipoRecibo;
  tipoPago?: string;
  presencial?: boolean;
  fotoUrl?: string;
  fotoLocal?: string;
  gpsUbicacion?: string;
};
