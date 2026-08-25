/** Clave provisional — reemplazar cuando el usuario la indique. */
export const CONSULTA_MASTER_KEY = "PENDIENTE";
export const MASTER_STORAGE_KEY = "consulta_master";
const MASTER_RECORDAR_KEY = "consulta_master_recordar";

export function dispositivoMasterRecordado(): boolean {
  try {
    return localStorage.getItem(MASTER_RECORDAR_KEY) === "1";
  } catch {
    return false;
  }
}

export function leerMasterActivo(): boolean {
  try {
    return (
      localStorage.getItem(MASTER_STORAGE_KEY) === "1" ||
      sessionStorage.getItem(MASTER_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function guardarMasterActivo(activo: boolean, recordar = false): void {
  try {
    if (recordar) {
      localStorage.setItem(MASTER_RECORDAR_KEY, "1");
    }
    if (activo) {
      if (recordar || dispositivoMasterRecordado()) {
        localStorage.setItem(MASTER_STORAGE_KEY, "1");
        sessionStorage.removeItem(MASTER_STORAGE_KEY);
      } else {
        sessionStorage.setItem(MASTER_STORAGE_KEY, "1");
      }
    } else {
      sessionStorage.removeItem(MASTER_STORAGE_KEY);
      if (!dispositivoMasterRecordado()) {
        localStorage.removeItem(MASTER_STORAGE_KEY);
      }
    }
  } catch {
    // ignore
  }
}

export function verificarClaveMaster(clave: string): boolean {
  return clave.trim() === CONSULTA_MASTER_KEY;
}
