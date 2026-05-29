const DB_NAME = "sp-recuperadores-fotos";
const STORE = "comprobantes";
const DB_VERSION = 1;

const MAX_ANCHO = 1200;
const MAX_ALTO = 1200;
const CALIDAD_JPEG = 0.72;

export function normalizarPlaca(placa: string): string {
  return placa.trim().toUpperCase().replace(/\s/g, "");
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Error al abrir caché"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

type EntradaCache = {
  dataUrl: string;
  updatedAt: number;
};

/** Guarda JPEG comprimido en caché local (IndexedDB), clave = placa. */
export async function guardarFotoEnCache(
  placa: string,
  dataUrl: string,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const key = normalizarPlaca(placa);
  if (!key) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(
        { dataUrl, updatedAt: Date.now() } satisfies EntradaCache,
        key,
      );
    });
    db.close();
  } catch {
    // caché opcional; no bloquear flujo
  }
}

export async function leerFotoDeCache(placa: string): Promise<string | null> {
  if (typeof indexedDB === "undefined") return null;
  const key = normalizarPlaca(placa);
  if (!key) return null;
  try {
    const db = await openDb();
    const entrada = await new Promise<EntradaCache | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      tx.onerror = () => reject(tx.error);
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as EntradaCache | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return entrada?.dataUrl ?? null;
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(blob);
  });
}

/** Redimensiona y comprime a JPEG para subida y caché. */
export async function comprimirImagen(file: File): Promise<{
  blob: Blob;
  dataUrl: string;
}> {
  const bitmap = await createImageBitmap(file);
  let ancho = bitmap.width;
  let alto = bitmap.height;
  const escala = Math.min(
    1,
    MAX_ANCHO / ancho,
    MAX_ALTO / alto,
  );
  ancho = Math.max(1, Math.round(ancho * escala));
  alto = Math.max(1, Math.round(alto * escala));

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("No se pudo procesar la imagen");
  }
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("No se pudo comprimir la imagen")),
      "image/jpeg",
      CALIDAD_JPEG,
    );
  });

  const dataUrl = await blobToDataUrl(blob);
  return { blob, dataUrl };
}

/**
 * Prioridad: caché local → comprimir remota y guardar en caché → URL remota.
 */
export async function resolverSrcFotoComprobante(
  placa: string,
  fotoRemota?: string | null,
): Promise<string | null> {
  const enCache = await leerFotoDeCache(placa);
  if (enCache) return enCache;
  if (!fotoRemota) return null;
  if (fotoRemota.startsWith("data:")) {
    await guardarFotoEnCache(placa, fotoRemota);
    return fotoRemota;
  }

  try {
    const res = await fetch(
      `/api/imagen-proxy?url=${encodeURIComponent(fotoRemota)}`,
      { cache: "force-cache" },
    );
    if (!res.ok) return fotoRemota;
    const blob = await res.blob();
    const file = new File([blob], "comprobante.jpg", {
      type: blob.type || "image/jpeg",
    });
    const { dataUrl } = await comprimirImagen(file);
    await guardarFotoEnCache(placa, dataUrl);
    return dataUrl;
  } catch {
    return fotoRemota;
  }
}

export async function prepararFotoPresencial(
  placa: string,
  file: File,
): Promise<{ blob: Blob; dataUrl: string; file: File }> {
  const { blob, dataUrl } = await comprimirImagen(file);
  await guardarFotoEnCache(placa, dataUrl);
  const comprimido = new File([blob], "comprobante.jpg", {
    type: "image/jpeg",
  });
  return { blob, dataUrl, file: comprimido };
}
