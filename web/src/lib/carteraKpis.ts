import { etiquetaCarteraStatus, nombrePerfilCartera } from "@/lib/carteraPerfiles";

export const PERFILES_KPI = ["dayana", "jhon_saenz"] as const;

export type PerfilKpiId = (typeof PERFILES_KPI)[number];

export type PerfilKpi = {
  id: PerfilKpiId;
  nombre: string;
  motos_hoy: number;
  estados_hoy: number;
  por_status: Array<{ id: string; label: string; n: number }>;
  ultima_at: string | null;
};

export type FilaGestionKpi = {
  perfil_id: string;
  status: string;
  placa: string;
  created_at: string;
};

export function isoInicioDiaBogota(ahora = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  return new Date(`${day}T00:00:00-05:00`).toISOString();
}

export function kpisDesdeGestiones(filas: FilaGestionKpi[]): PerfilKpi[] {
  return PERFILES_KPI.map((id) => {
    const mias = filas.filter((f) => f.perfil_id === id);
    const motos = new Set(mias.map((f) => f.placa));
    const conteo = new Map<string, number>();
    for (const f of mias) {
      conteo.set(f.status, (conteo.get(f.status) ?? 0) + 1);
    }
    const por_status = [...conteo.entries()]
      .map(([status, n]) => ({
        id: status,
        label: etiquetaCarteraStatus(status),
        n,
      }))
      .sort((a, b) => b.n - a.n);
    return {
      id,
      nombre: nombrePerfilCartera(id),
      motos_hoy: motos.size,
      estados_hoy: mias.length,
      por_status,
      ultima_at: mias[0]?.created_at ?? null,
    };
  });
}
