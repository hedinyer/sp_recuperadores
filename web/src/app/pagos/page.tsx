"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, CircleHelpIcon, XCircleIcon } from "lucide-react";

import { MasterGate } from "@/components/MasterGate";
import { NavFooter } from "@/components/NavFooter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearCOP } from "@/lib/formatoDinero";
import type { MovimientoExtracto } from "@/lib/pagosExtracto";
import type { VeredictoPago } from "@/lib/pagosHarness";
import { claveMovimiento } from "@/lib/pagosMatch";

const MAX_IMAGE_BYTES = 1_800_000;

type ResultadoUi = {
  veredicto: VeredictoPago;
  resumen: string;
  ocr: {
    monto_cop: number;
    fecha: string;
    hora: string;
    votos: number;
    total_ocr: number;
  } | null;
  candidato: MovimientoExtracto | null;
  ocr_ok: number;
  match_ok: number;
  eval_ok: number;
};

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 1600;
      let { width, height } = img;
      if (width > maxSide || height > maxSide) {
        const scale = maxSide / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No se pudo leer la imagen"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > MAX_IMAGE_BYTES && quality > 0.4) {
        quality -= 0.12;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUrl.length > MAX_IMAGE_BYTES) {
        reject(new Error("La imagen sigue siendo muy grande. Usa otra foto."));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo abrir la imagen"));
    };
    img.src = url;
  });
}

/** Imagen del portapapeles (Ctrl+V / captura). */
function imagenDesdeClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (!item.type.startsWith("image/")) continue;
    const blob = item.getAsFile();
    if (!blob) continue;
    const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return new File([blob], `comprobante-pegado.${ext}`, {
      type: item.type || "image/png",
    });
  }
  for (const f of Array.from(data.files ?? [])) {
    if (f.type.startsWith("image/")) return f;
  }
  return null;
}

function etiquetaVeredicto(v: VeredictoPago): string {
  if (v === "entro") return "Entró";
  if (v === "no_entro") return "No entró";
  return "Revisar";
}

function IconoVeredicto({ v }: { v: VeredictoPago }) {
  if (v === "entro") {
    return <CheckCircle2Icon className="size-6 shrink-0 text-emerald-400" aria-hidden />;
  }
  if (v === "no_entro") {
    return <XCircleIcon className="size-6 shrink-0 text-red-400" aria-hidden />;
  }
  return <CircleHelpIcon className="size-6 shrink-0 text-amber-400" aria-hidden />;
}

function PagosWorkspace() {
  const excelId = useId();
  const fotoId = useId();
  const excelErrId = useId();
  const fotoErrId = useId();
  const excelRef = useRef<HTMLInputElement>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const pegarZonaRef = useRef<HTMLDivElement>(null);

  const [movimientos, setMovimientos] = useState<MovimientoExtracto[]>([]);
  const [archivosNombres, setArchivosNombres] = useState<string[]>([]);
  const [ingresos, setIngresos] = useState(0);
  const [usados, setUsados] = useState<string[]>([]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fotoNombre, setFotoNombre] = useState<string | null>(null);

  const [excelError, setExcelError] = useState<string | null>(null);
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [subiendoExcel, setSubiendoExcel] = useState(false);
  const [comprobando, setComprobando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoUi | null>(null);

  const onExcel = useCallback(async (fileList: FileList | File[] | null) => {
    setExcelError(null);
    setFormError(null);
    setResultado(null);
    const files = Array.from(fileList ?? []).filter((f) => f.size > 0);
    if (!files.length) {
      setExcelError("Elige uno o más Excel .xlsx");
      return;
    }
    const invalid = files.find((f) => {
      const n = f.name.toLowerCase();
      return !n.endsWith(".xlsx") && !n.endsWith(".xls");
    });
    if (invalid) {
      setExcelError(`"${invalid.name}" no es un Excel .xlsx`);
      excelRef.current?.focus();
      return;
    }
    setSubiendoExcel(true);
    try {
      const fd = new FormData();
      for (const file of files) fd.append("file", file);
      const res = await fetch("/api/pagos/extracto", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo leer el Excel");
      setMovimientos(json.movimientos as MovimientoExtracto[]);
      const nombres = Array.isArray(json.archivos)
        ? (json.archivos as string[])
        : [String(json.archivo ?? files.map((f) => f.name).join(", "))];
      setArchivosNombres(nombres);
      setIngresos(Number(json.ingresos ?? 0));
      setUsados([]);
    } catch (e) {
      setMovimientos([]);
      setArchivosNombres([]);
      setIngresos(0);
      setExcelError(e instanceof Error ? e.message : "Error al leer el Excel");
      excelRef.current?.focus();
    } finally {
      setSubiendoExcel(false);
    }
  }, []);

  const onFoto = useCallback(async (file: File | undefined) => {
    setFotoError(null);
    setFormError(null);
    setResultado(null);
    if (!file) {
      setFotoError("Sube o pega una foto del comprobante");
      return;
    }
    const okType =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif)$/i.test(file.name);
    if (!okType) {
      setFotoError("Usa una imagen JPEG o PNG");
      fotoRef.current?.focus();
      return;
    }
    try {
      const dataUrl = await compressImage(file);
      setImageDataUrl(dataUrl);
      setPreviewUrl(dataUrl);
      setFotoNombre(file.name);
    } catch (e) {
      setImageDataUrl(null);
      setPreviewUrl(null);
      setFotoNombre(null);
      setFotoError(e instanceof Error ? e.message : "No se pudo leer la foto");
      fotoRef.current?.focus();
    }
  }, []);

  // Ctrl+V / Cmd+V en cualquier parte de la página
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (comprobando) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA") &&
        (target as HTMLInputElement).type !== "file"
      ) {
        return;
      }
      const file = imagenDesdeClipboard(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void onFoto(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [comprobando, onFoto]);

  const comprobar = useCallback(async () => {
    setFormError(null);
    setExcelError(null);
    setFotoError(null);
    let firstInvalid: HTMLElement | null = null;
    if (!movimientos.length) {
      setExcelError("Carga el extracto del banco antes de comprobar");
      firstInvalid = excelRef.current;
    }
    if (!imageDataUrl) {
      setFotoError("Sube o pega una foto del comprobante");
      if (!firstInvalid) firstInvalid = pegarZonaRef.current ?? fotoRef.current;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    setComprobando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/pagos/comprobar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_data_url: imageDataUrl,
          movimientos,
          usados,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo comprobar");
      const r: ResultadoUi = {
        veredicto: json.veredicto,
        resumen: json.resumen,
        ocr: json.ocr,
        candidato: json.candidato,
        ocr_ok: json.ocr_ok,
        match_ok: json.match_ok,
        eval_ok: json.eval_ok,
      };
      setResultado(r);
      if (r.veredicto === "entro" && r.candidato) {
        setUsados((prev) => [...prev, claveMovimiento(r.candidato!)]);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error al comprobar el pago");
    } finally {
      setComprobando(false);
    }
  }, [imageDataUrl, movimientos, usados]);

  return (
    <>
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="mx-auto w-full max-w-[414px]">
          <h1 className="text-lg font-bold tracking-tight text-balance">Pagos</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Cruza el comprobante con el extracto del banco (monto, fecha y hora)
          </p>
          <Link
            href="/nicolas"
            className="mt-1 inline-block min-h-11 py-2 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
          >
            Volver a Admin
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[414px] flex-1 flex-col gap-5 px-3 pt-4 pb-6 sm:px-4">
        <section className="flex flex-col gap-2" aria-labelledby={`${excelId}-label`}>
          <label
            id={`${excelId}-label`}
            htmlFor={excelId}
            className="text-sm font-medium text-foreground"
          >
            Extracto del banco
          </label>
          <p className="text-xs text-muted-foreground text-pretty">
            Uno o varios Excel Bancolombia (.xlsx) con Fecha de Movimiento, Hora
            y Valor Total
          </p>
          <input
            ref={excelRef}
            id={excelId}
            type="file"
            multiple
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-invalid={excelError ? true : undefined}
            aria-describedby={excelError ? excelErrId : undefined}
            disabled={subiendoExcel || comprobando}
            onChange={(e) => void onExcel(e.target.files)}
            className="block w-full min-h-11 cursor-pointer rounded-xl border border-border bg-zinc-900/60 px-3 py-2.5 text-base text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {excelError ? (
            <p id={excelErrId} role="alert" className="text-sm text-red-300">
              {excelError}
            </p>
          ) : null}
          {archivosNombres.length > 0 && !excelError ? (
            <div className="flex flex-col gap-1 text-xs text-zinc-400">
              <p>
                {archivosNombres.length === 1
                  ? archivosNombres[0]
                  : `${archivosNombres.length} extractos`}
                :{" "}
                <span className="tabular-nums font-medium text-zinc-200">
                  {ingresos}
                </span>{" "}
                ingresos listos
                {usados.length > 0 ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="tabular-nums">{usados.length}</span> ya
                    confirmados en esta sesión
                  </>
                ) : null}
              </p>
              {archivosNombres.length > 1 ? (
                <ul className="list-disc pl-4 text-zinc-500">
                  {archivosNombres.map((n) => (
                    <li key={n} className="truncate">
                      {n}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {archivosNombres.length === 0 && !excelError ? (
            <p className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-3.5 py-4 text-sm text-zinc-400 text-pretty">
              Carga uno o varios extractos para comprobar comprobantes.
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-2" aria-labelledby={`${fotoId}-label`}>
          <label
            id={`${fotoId}-label`}
            htmlFor={fotoId}
            className="text-sm font-medium text-foreground"
          >
            Foto del comprobante
          </label>
          <p className="text-xs text-muted-foreground text-pretty">
            Sube, captura o pega (Ctrl+V) un voucher de cualquier banco
          </p>
          <div
            ref={pegarZonaRef}
            tabIndex={0}
            role="group"
            aria-label="Zona para pegar o subir el comprobante"
            onPaste={(e) => {
              if (comprobando) return;
              const file = imagenDesdeClipboard(e.clipboardData);
              if (!file) return;
              e.preventDefault();
              void onFoto(file);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (comprobando) return;
              const file = e.dataTransfer.files?.[0];
              if (file) void onFoto(file);
            }}
            className="rounded-xl border border-dashed border-zinc-600 bg-zinc-900/50 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <input
              ref={fotoRef}
              id={fotoId}
              type="file"
              accept="image/*"
              capture="environment"
              aria-invalid={fotoError ? true : undefined}
              aria-describedby={fotoError ? fotoErrId : undefined}
              disabled={comprobando}
              onChange={(e) => void onFoto(e.target.files?.[0])}
              className="block w-full min-h-11 cursor-pointer rounded-lg border border-border bg-zinc-900/60 px-3 py-2.5 text-base text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-2 text-center text-xs text-zinc-500 text-pretty">
              O pega aquí una captura · Ctrl+V / Cmd+V
            </p>
          </div>
          {fotoError ? (
            <p id={fotoErrId} role="alert" className="text-sm text-red-300">
              {fotoError}
            </p>
          ) : null}
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={
                fotoNombre
                  ? `Vista previa del comprobante ${fotoNombre}`
                  : "Vista previa del comprobante de pago"
              }
              className="mt-1 max-h-52 w-full rounded-xl border border-zinc-700 object-contain bg-zinc-900 outline outline-1 outline-black/10"
            />
          ) : null}
        </section>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="min-h-12 w-full rounded-xl text-base font-semibold active:scale-[0.96] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
            disabled={comprobando || subiendoExcel}
            onClick={() => void comprobar()}
          >
            {comprobando ? "Comprobando…" : "Comprobar pago"}
          </Button>
          {comprobando ? (
            <p className="text-xs text-muted-foreground text-pretty" role="status">
              Hermes lee la imagen y la cruza con el extracto. Suele tardar
              ~15–30 s.
            </p>
          ) : null}
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        {resultado ? (
          <section
            role="status"
            aria-live="polite"
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <IconoVeredicto v={resultado.veredicto} />
              <div className="min-w-0">
                <p className="text-base font-semibold text-white">
                  {etiquetaVeredicto(resultado.veredicto)}
                </p>
                <p className="mt-0.5 text-sm text-zinc-300 text-pretty">
                  {resultado.resumen}
                </p>
              </div>
            </div>
            {resultado.ocr ? (
              <dl className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                <div>
                  <dt>OCR monto</dt>
                  <dd className="tabular-nums text-zinc-200 font-medium">
                    {formatearCOP(resultado.ocr.monto_cop)}
                  </dd>
                </div>
                <div>
                  <dt>OCR fecha / hora</dt>
                  <dd className="tabular-nums text-zinc-200 font-medium">
                    {resultado.ocr.fecha} {resultado.ocr.hora.slice(0, 5)}
                  </dd>
                </div>
                <div>
                  <dt>Votos OCR</dt>
                  <dd className="tabular-nums text-zinc-200">
                    {resultado.ocr.votos}/{resultado.ocr.total_ocr}
                  </dd>
                </div>
                <div>
                  <dt>Agentes</dt>
                  <dd className="tabular-nums text-zinc-200">
                    OCR {resultado.ocr_ok} · Match {resultado.match_ok} · Eval{" "}
                    {resultado.eval_ok}
                  </dd>
                </div>
              </dl>
            ) : null}
            {resultado.candidato ? (
              <p className="text-xs text-zinc-400 text-pretty">
                Movimiento: doc{" "}
                <span className="tabular-nums text-zinc-200">
                  {resultado.candidato.documento}
                </span>
                {" · "}
                {formatearCOP(resultado.candidato.monto_cop)}
                {" · "}
                <span className="tabular-nums">
                  {resultado.candidato.fecha}{" "}
                  {resultado.candidato.hora.slice(0, 5)}
                </span>
              </p>
            ) : null}
          </section>
        ) : null}
      </main>
    </>
  );
}

export default function PagosPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <MasterGate title="Pagos" subtitle="Escribe la clave para continuar">
        <PagosWorkspace />
      </MasterGate>
      <NavFooter />
    </div>
  );
}
