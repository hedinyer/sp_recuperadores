export type Destinatario = {
  configuracionId: number;
  cuenta: string;
};

export type ContratoOpt = {
  contratoId: number;
  clienteId: number;
  clienteNombre: string;
  cedula: string;
  tarifa: number;
  frecuencia: string;
};

export type FacturaView = {
  id: number;
  fecha: string;
  total: number;
  saldo: number;
};

export type PlanRow = {
  facturaId: number;
  fecha: string;
  saldoAntes: number;
  aplicar: number;
  queda: number;
};

export type PreviewResult = {
  contratos: ContratoOpt[];
  contratoId: number | null;
  facturas: FacturaView[];
  plan: PlanRow[];
  sobrante: number;
};

export type PagoAplicado = {
  pagoId: number;
  facturaId: number;
  aplicado: number;
  estado: string;
};

export type RegistrarResult = {
  clienteNombre: string;
  contratoId: number;
  pagos: PagoAplicado[];
  sobrante: number;
  prepagoId: number | null;
};
