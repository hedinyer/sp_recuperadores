import type { MorosoBandeja } from "@/lib/carteraMorososTypes";

export const LOTE_TIPOS = ["cuotas_17", "atraso_3_8"] as const;
export type LoteTipo = (typeof LOTE_TIPOS)[number];

export const LOTE_17_PERFILES = ["jhon_saenz", "james_blanco"] as const;
export type Lote17PerfilId = (typeof LOTE_17_PERFILES)[number];

export const LOTE_NICOLAS_PERFIL = "admin_nicolas" as const;
export type LoteNicolasPerfilId = typeof LOTE_NICOLAS_PERFIL;

export type LoteOperativoPerfilId = Lote17PerfilId | LoteNicolasPerfilId;

export const LOTE_17_DIAS = 4;

export type Lote17Status = "activo" | "vencido" | "cerrado";

export type Lote17Row = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: Lote17Status;
  created_by_perfil_id: string | null;
  created_at: string;
  tipo?: LoteTipo;
};

export type Lote17PlacaRow = {
  lote_id: number;
  placa: string;
  perfil_id: string;
  orden: number;
  nombre: string | null;
  cedula: string | null;
  deuda_total: number | null;
  cuotas_pendientes: number | null;
  dias_mora?: number | null;
};

export type Lote17Item = MorosoBandeja & {
  orden: number;
  gestion_ayer: boolean;
  ultima_gestion_texto: string | null;
  estado_contrato?: string;
  estado_vehiculo?: string;
  motivo_estado?: string | null;
  etiqueta_estado?: string | null;
  fecha_corte?: string | null;
  deuda_al_corte?: boolean;
};

export type Lote17Payload = {
  lote: Lote17Row | null;
  items: Lote17Item[];
  puede_crear: boolean;
  auto_creado: boolean;
  resumen: {
    total: number;
    por_hacer: number;
    gestionados_hoy: number;
    contactados_ayer: number;
    pagaron_hoy: number;
  };
};

/** Clave numérica para ver métricas del lote 17+. */
export const LOTE_17_METRICAS_CLAVE = "8484";
export const LOTE_17_METRICAS_STORAGE_KEY = "cartera_lote17_metricas_ok";

export type LoteMetricasPerfilId = LoteOperativoPerfilId;

export type Lote17MetricasPerfil = {
  id: LoteMetricasPerfilId;
  nombre: string;
  n_placas: number;
  cartera_total: number;
  recaudado_lote: number;
  recaudado_hoy: number;
  motos_con_abono_lote: number;
  pct_recuperado: number;
  etiqueta?: string;
};

export type Lote17Metricas = {
  lote_id: number;
  starts_at: string;
  ends_at: string;
  actualizado_en: string;
  equipo: {
    n_placas: number;
    cartera_total: number;
    recaudado_lote: number;
    recaudado_hoy: number;
    pct_recuperado: number;
  };
  por_perfil: Lote17MetricasPerfil[];
};

export type MetricasAdminPayload = {
  actualizado_en: string;
  por_perfil: Lote17MetricasPerfil[];
};

export function esLote17Perfil(
  id: string | null | undefined,
): id is Lote17PerfilId {
  return LOTE_17_PERFILES.includes(id as Lote17PerfilId);
}

export function esLoteNicolasPerfil(
  id: string | null | undefined,
): id is LoteNicolasPerfilId {
  return id === LOTE_NICOLAS_PERFIL;
}

export function esLoteOperativoPerfil(
  id: string | null | undefined,
): id is LoteOperativoPerfilId {
  return esLote17Perfil(id) || esLoteNicolasPerfil(id);
}

/** Fin de plazo: starts_at + 4 días (misma hora). */
export function calcularEndsAt(startsAt: Date = new Date()): string {
  const ends = new Date(startsAt.getTime() + LOTE_17_DIAS * 86_400_000);
  return ends.toISOString();
}
