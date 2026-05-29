import { toPng } from "html-to-image";

import {
  guardarFotoEnCache,
  leerFotoDeCache,
  normalizarPlaca,
} from "@/lib/fotoComprobante";

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(header)?.[1] ?? "image/png";
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("No se pudo leer la foto"));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("No se pudo convertir la imagen"));
    reader.readAsDataURL(blob);
  });
}

/** Convierte URL remota (Supabase) a data URL; prioriza caché local por placa. */
async function urlImagenADataUrl(
  url: string,
  placa?: string,
): Promise<string> {
  if (url.startsWith("data:")) return url;

  if (placa) {
    const enCache = await leerFotoDeCache(placa);
    if (enCache) return enCache;
  }

  const res = await fetch(
    `/api/imagen-proxy?url=${encodeURIComponent(url)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("No se pudo cargar la imagen del comprobante");
  const dataUrl = await blobToDataUrl(await res.blob());
  if (placa) await guardarFotoEnCache(placa, dataUrl);
  return dataUrl;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function esperarImagenLista(img: HTMLImageElement): Promise<void> {
  if (typeof img.decode === "function") {
    try {
      await img.decode();
      return;
    } catch {
      // continuar con onload
    }
  }
  if (img.complete && img.naturalWidth > 0) return;
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}

/** Asegura que el comprobante (y demás fotos) estén cargados antes de capturar. */
async function esperarImagenesRecibo(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll("img"));

  for (const img of images) {
    const placa = img.dataset.placa;
    if (placa) {
      const enCache = await leerFotoDeCache(placa);
      if (enCache) {
        img.src = enCache;
        img.removeAttribute("crossorigin");
      }
    }
  }

  await Promise.all(images.map((img) => esperarImagenLista(img)));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
}

/**
 * Sustituye temporalmente las &lt;img&gt; por data URLs para que html-to-image
 * no dibuje cuadros negros (CORS / canvas tainted).
 */
async function inlineImagenesParaCaptura(
  element: HTMLElement,
): Promise<Map<HTMLImageElement, string>> {
  const originals = new Map<HTMLImageElement, string>();
  const images = Array.from(element.querySelectorAll("img"));

  for (const img of images) {
    const original = img.currentSrc || img.src;
    if (!original) continue;
    originals.set(img, original);

    const placaAttr = img.dataset.placa;
    const placa = placaAttr ? normalizarPlaca(placaAttr) : undefined;

    try {
      const dataUrl = await urlImagenADataUrl(original, placa);
      img.src = dataUrl;
      img.removeAttribute("crossorigin");
      await esperarImagenLista(img);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    } catch {
      // Si falla, se deja la URL original
    }
  }

  return originals;
}

/** JPEG para WhatsApp (mejor compatibilidad que PNG en Web Share). */
async function dataUrlAArchivoCompartir(
  dataUrl: string,
  nombreArchivo: string,
): Promise<File> {
  try {
    const blob = dataUrlToBlob(dataUrl);
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("jpeg"))),
        "image/jpeg",
        0.88,
      );
    });
    const nombre = nombreArchivo.replace(/\.png$/i, ".jpg");
    return new File([jpeg], nombre, { type: "image/jpeg" });
  } catch {
    const blob = dataUrlToBlob(dataUrl);
    return new File([blob], nombreArchivo, { type: "image/png" });
  }
}

/** Espera imágenes del recibo y genera PNG (evita fallos por carga pendiente o CORS). */
export async function capturarReciboPng(element: HTMLElement): Promise<string> {
  await esperarImagenesRecibo(element);
  const originals = await inlineImagenesParaCaptura(element);

  const opciones = {
    backgroundColor: "#09090b",
    cacheBust: false as const,
  };

  try {
    try {
      return await toPng(element, { ...opciones, pixelRatio: 2 });
    } catch {
      return await toPng(element, { ...opciones, pixelRatio: 1 });
    }
  } finally {
    for (const [img, src] of originals) {
      img.src = src;
    }
  }
}

export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = nombre;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function abrirWhatsAppConTexto(texto: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.location.assign(url);
}

/**
 * Comparte el recibo como imagen en WhatsApp.
 * No mezcla texto + archivo en navigator.share (WhatsApp suele ignorar la imagen).
 */
export async function compartirReciboWhatsApp(
  texto: string,
  dataUrl: string,
  nombreArchivo: string,
): Promise<"share" | "wa_y_descarga" | "solo_texto"> {
  const archivo = await dataUrlAArchivoCompartir(dataUrl, nombreArchivo);

  if (typeof navigator.share === "function") {
    const soloImagen: ShareData = { files: [archivo] };
    try {
      if (!navigator.canShare || navigator.canShare(soloImagen)) {
        await navigator.share(soloImagen);
        return "share";
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "share";
    }
  }

  // Fallback: guardar imagen y abrir WhatsApp con el texto (adjuntar imagen manualmente)
  descargarBlob(archivo, archivo.name);
  await esperar(800);
  abrirWhatsAppConTexto(texto);
  return "wa_y_descarga";
}
