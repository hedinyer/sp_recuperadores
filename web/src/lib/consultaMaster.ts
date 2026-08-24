/** Clave provisional — reemplazar cuando el usuario la indique. */
export const CONSULTA_MASTER_KEY = "PENDIENTE";
export const MASTER_STORAGE_KEY = "consulta_master";

export function leerMasterActivo(): boolean {
  try {
    return sessionStorage.getItem(MASTER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function guardarMasterActivo(activo: boolean): void {
  try {
    if (activo) sessionStorage.setItem(MASTER_STORAGE_KEY, "1");
    else sessionStorage.removeItem(MASTER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function verificarClaveMaster(clave: string): boolean {
  return clave.trim() === CONSULTA_MASTER_KEY;
}
