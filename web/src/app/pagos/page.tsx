"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleHelpIcon,
  FileSpreadsheetIcon,
  ImageIcon,
  Loader2Icon,
  SendIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";

import { ChatMarkdown } from "@/components/ChatMarkdown";
import { MasterGate } from "@/components/MasterGate";
import { PagosPensamientoTypewriter } from "@/components/PagosPensamientoTypewriter";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearCOP } from "@/lib/formatoDinero";
import type { MovimientoExtracto } from "@/lib/pagosExtracto";
import type { VeredictoPago } from "@/lib/pagosHarness";
import { claveMovimiento } from "@/lib/pagosMatch";
import {
  formatearFechaEs,
  parseAlertaReuso,
} from "@/lib/pagosOcrClient";

const MAX_IMAGE_BYTES = 1_800_000;

type SparkExtractoUi = {
  id: string;
  nombre: string;
  filas: number;
  activo: boolean;
  fecha_min: string | null;
  fecha_max: string | null;
  fechas: string[];
};

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

function formatearPrimeraVez(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
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

/** Imagen del portapapeles (Ctrl+V). */
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
    return (
      <CheckCircle2Icon
        className="size-5 shrink-0 text-emerald-400"
        aria-hidden
      />
    );
  }
  if (v === "no_entro") {
    return (
      <XCircleIcon className="size-5 shrink-0 text-red-400" aria-hidden />
    );
  }
  return (
    <CircleHelpIcon className="size-5 shrink-0 text-amber-400" aria-hidden />
  );
}

function PagosWorkspace() {
  const excelId = useId();
  const fotoId = useId();
  const excelErrId = useId();
  const fotoErrId = useId();
  const pensarPanelId = useId();
  const liveId = useId();
  const excelRef = useRef<HTMLInputElement>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const pegarZonaRef = useRef<HTMLDivElement>(null);
  const pensarScrollRef = useRef<HTMLDivElement>(null);

  const [movimientos, setMovimientos] = useState<MovimientoExtracto[]>([]);
  const [archivosNombres, setArchivosNombres] = useState<string[]>([]);
  const [ingresos, setIngresos] = useState(0);
  const [viaAgente, setViaAgente] = useState(false);
  const [sinHora, setSinHora] = useState(false);
  const [extractosSpark, setExtractosSpark] = useState<SparkExtractoUi[]>([]);
  const [fechaFaltante, setFechaFaltante] = useState<string | null>(null);
  const [cargandoExtractos, setCargandoExtractos] = useState(true);
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
  const [pensamientos, setPensamientos] = useState<string[]>([]);
  const [pensarAbierto, setPensarAbierto] = useState(true);
  const [liveMsg, setLiveMsg] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [mensajes, setMensajes] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [enviando, setEnviando] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const refreshExtractosSpark = useCallback(async () => {
    try {
      const res = await fetch("/api/pagos/extractos");
      const json = (await res.json()) as {
        error?: string;
        extractos?: SparkExtractoUi[];
      };
      if (!res.ok) throw new Error(json.error ?? "No se listaron extractos");
      setExtractosSpark(Array.isArray(json.extractos) ? json.extractos : []);
    } catch {
      // La sesión puede seguir con extractos locales si Spark falla al listar
    } finally {
      setCargandoExtractos(false);
    }
  }, []);

  useEffect(() => {
    void refreshExtractosSpark();
  }, [refreshExtractosSpark]);

  const onExcel = useCallback(async (fileList: FileList | File[] | null) => {
    setExcelError(null);
    setFormError(null);
    setResultado(null);
    setPensamientos([]);
    setMensajes([]);
    setLiveMsg("");
    setFechaFaltante(null);
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
      setViaAgente(json.via === "agente");
      setSinHora(Boolean(json.sin_hora));
      setUsados([]);
      await refreshExtractosSpark();
      const sparkHint = json.spark_id
        ? " · guardado en Spark"
        : json.spark_error
          ? ` · aviso Spark: ${String(json.spark_error).slice(0, 80)}`
          : "";
      setLiveMsg(
        `${Number(json.ingresos ?? 0)} ingresos listos en el extracto${sparkHint}`,
      );
    } catch (e) {
      setMovimientos([]);
      setArchivosNombres([]);
      setIngresos(0);
      setViaAgente(false);
      setSinHora(false);
      setExcelError(e instanceof Error ? e.message : "Error al leer el Excel");
      excelRef.current?.focus();
    } finally {
      setSubiendoExcel(false);
    }
  }, [refreshExtractosSpark]);

  const onFoto = useCallback(async (file: File | undefined) => {
    setFotoError(null);
    setFormError(null);
    setResultado(null);
    if (!file) {
      setFotoError("Elige o pega una imagen del comprobante");
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
      setLiveMsg("Comprobante listo");
    } catch (e) {
      setImageDataUrl(null);
      setPreviewUrl(null);
      setFotoNombre(null);
      setFotoError(e instanceof Error ? e.message : "No se pudo leer la foto");
      fotoRef.current?.focus();
    }
  }, []);

  const comprobar = useCallback(async () => {
    setFormError(null);
    setExcelError(null);
    setFotoError(null);
    setFechaFaltante(null);
    let firstInvalid: HTMLElement | null = null;
    if (!imageDataUrl) {
      setFotoError("Elige o pega una imagen del comprobante");
      firstInvalid = pegarZonaRef.current ?? fotoRef.current;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    setComprobando(true);
    setResultado(null);
    setPensamientos([]);
    setPensarAbierto(true);
    setLiveMsg("Comprobando pago…");
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

      const ctype = res.headers.get("content-type") ?? "";
      if (!ctype.includes("ndjson")) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "No se pudo comprobar");
      }
      if (!res.ok || !res.body) {
        throw new Error("No se pudo comprobar el pago");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let gotResult = false;
      let faltaFecha: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let ev: {
            type: string;
            text?: string;
            error?: string;
            fecha?: string;
            fecha_label?: string;
            result?: ResultadoUi & Record<string, unknown>;
          };
          try {
            ev = JSON.parse(trimmed) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === "thought" && ev.text) {
            setPensamientos((prev) => [...prev, ev.text!]);
            setLiveMsg(ev.text);
          } else if (ev.type === "falta_extracto" && ev.fecha) {
            faltaFecha = ev.fecha;
            setFechaFaltante(ev.fecha);
            setLiveMsg(
              ev.fecha_label
                ? `Falta el extracto del ${ev.fecha_label}`
                : `Falta el extracto del ${ev.fecha}`,
            );
          } else if (ev.type === "error") {
            if (faltaFecha) {
              setExcelError(
                ev.error ??
                  `Carga el extracto del ${formatearFechaEs(faltaFecha)}`,
              );
            } else {
              throw new Error(ev.error ?? "Error al comprobar el pago");
            }
          } else if (ev.type === "result" && ev.result) {
            gotResult = true;
            const r: ResultadoUi = {
              veredicto: ev.result.veredicto,
              resumen: ev.result.resumen,
              ocr: ev.result.ocr,
              candidato: ev.result.candidato,
              ocr_ok: ev.result.ocr_ok,
              match_ok: ev.result.match_ok,
              eval_ok: ev.result.eval_ok,
            };
            setResultado(r);
            const reuso = parseAlertaReuso(r.resumen);
            setLiveMsg(
              reuso.activa
                ? `Alerta: comprobante ya validado antes${reuso.veces ? ` (${reuso.veces} veces)` : ""}. ${etiquetaVeredicto(r.veredicto)}. ${r.resumen}`
                : `${etiquetaVeredicto(r.veredicto)}. ${r.resumen}`,
            );
            if (r.veredicto === "entro" && r.candidato) {
              setUsados((prev) => [...prev, claveMovimiento(r.candidato!)]);
            }
          }
        }
      }
      if (!gotResult) {
        if (faltaFecha) {
          setExcelError(
            `Carga el extracto del ${formatearFechaEs(faltaFecha)}`,
          );
          excelRef.current?.focus();
          return;
        }
        throw new Error("No llegó el veredicto del harness");
      }
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : "Error al comprobar el pago",
      );
      setLiveMsg("Error al comprobar el pago");
    } finally {
      setComprobando(false);
    }
  }, [imageDataUrl, movimientos, usados]);

  const contextoCruce = useCallback(() => {
    const partes: string[] = [];
    if (ingresos) {
      partes.push(
        `Extracto: ${ingresos} ingresos` +
          (sinHora ? " (sin columna de hora)" : "") +
          (usados.length ? `; ${usados.length} ya confirmados en sesión` : ""),
      );
    }
    if (resultado) {
      partes.push(`Último veredicto: ${etiquetaVeredicto(resultado.veredicto)}.`);
      partes.push(resultado.resumen);
      if (resultado.ocr) {
        partes.push(
          `OCR: $${resultado.ocr.monto_cop.toLocaleString("es-CO")} ${resultado.ocr.fecha} ${resultado.ocr.hora.slice(0, 5)}`,
        );
      }
      if (resultado.candidato) {
        partes.push(
          `Candidato: doc ${resultado.candidato.documento} · $${resultado.candidato.monto_cop.toLocaleString("es-CO")} · ${resultado.candidato.fecha} ${resultado.candidato.hora.slice(0, 5) || "—"}`,
        );
      }
    }
    return partes.join("\n");
  }, [ingresos, sinHora, usados.length, resultado]);

  const enviarMensaje = useCallback(async () => {
    const text = draft.trim();
    if (!text || enviando || comprobando) return;
    setFormError(null);
    setDraft("");
    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const historial = [...mensajes, userMsg];
    setMensajes(historial);
    setEnviando(true);
    setLiveMsg("Enviando mensaje…");
    try {
      const res = await fetch("/api/pagos/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          messages: historial.slice(0, -1).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          contexto: contextoCruce() || null,
          image_data_url: imageDataUrl,
        }),
      });
      const json = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "No se pudo enviar");
      const reply = String(json.content ?? "").trim();
      if (!reply) throw new Error("Respuesta vacía");
      setMensajes((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: reply },
      ]);
      setLiveMsg("Respuesta recibida");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error al enviar el mensaje");
      setLiveMsg("Error al enviar el mensaje");
    } finally {
      setEnviando(false);
      draftRef.current?.focus();
    }
  }, [
    draft,
    enviando,
    comprobando,
    mensajes,
    contextoCruce,
    imageDataUrl,
  ]);

  // Ctrl+V en cualquier parte de la página
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (comprobando || enviando) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA") &&
        (target as HTMLInputElement).type !== "file"
      ) {
        // En el textarea: si hay imagen en el clipboard, adjuntarla; si no, dejar pegar texto
        if (target === draftRef.current) {
          const file = imagenDesdeClipboard(e.clipboardData);
          if (file) {
            e.preventDefault();
            void onFoto(file);
          }
        }
        return;
      }
      const file = imagenDesdeClipboard(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void onFoto(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [comprobando, enviando, onFoto]);

  // Ctrl+Enter → comprobar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "Enter") return;
      if (comprobando || subiendoExcel || enviando) return;
      e.preventDefault();
      void comprobar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [comprobar, comprobando, subiendoExcel, enviando]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, resultado, pensamientos.length, comprobando, enviando]);

  useEffect(() => {
    if (!pensarAbierto || !pensarScrollRef.current) return;
    const el = pensarScrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [pensamientos, pensarAbierto, comprobando]);

  const scrollPensamiento = useCallback(() => {
    const el = pensarScrollRef.current;
    if (!el) return;
    // rAF: el typewriter pinta y luego bajamos al fondo
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  const tieneExtracto =
    (archivosNombres.length > 0 && !excelError) || extractosSpark.length > 0;
  const tieneThread =
    pensamientos.length > 0 ||
    comprobando ||
    resultado != null ||
    mensajes.length > 0 ||
    enviando ||
    fechaFaltante != null;

  const alertaReuso = resultado
    ? parseAlertaReuso(resultado.resumen)
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <a
        href="#pagos-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zinc-100 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Ir al contenido
      </a>

      <div
        id={liveId}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveMsg}
      </div>

      <header className="shrink-0 border-b border-border px-4 py-3 lg:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-balance text-foreground">
              Pagos
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
              Cruza el comprobante con el extracto del banco
            </p>
          </div>
          <Link
            href="/nicolas"
            className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Admin
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar — extracto */}
        <aside
          className="flex w-[272px] shrink-0 flex-col border-r border-border bg-zinc-950/80"
          aria-label="Extracto del banco"
        >
          <div className="flex flex-col gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">Extracto</p>
              <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                Se guarda en la Spark. Al comprobar, se busca el día del
                comprobante.
              </p>
            </div>

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
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-start gap-2 rounded-xl"
              disabled={subiendoExcel || comprobando}
              onClick={() => excelRef.current?.click()}
              aria-busy={subiendoExcel}
            >
              {subiendoExcel ? (
                <Loader2Icon
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <FileSpreadsheetIcon className="size-4" aria-hidden />
              )}
              {subiendoExcel
                ? "Guardando en Spark…"
                : fechaFaltante
                  ? `Cargar extracto del ${fechaFaltante}`
                  : "Elegir extracto Excel"}
            </Button>

            {fechaFaltante ? (
              <div
                role="alert"
                className="rounded-xl border border-amber-400/50 bg-amber-500/15 px-3 py-3"
              >
                <p className="text-sm font-semibold text-amber-100">
                  Falta extracto del día
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-50/90 text-pretty">
                  El comprobante es del{" "}
                  <span className="font-medium">
                    {formatearFechaEs(fechaFaltante)}
                  </span>
                  . Sube el Excel del banco de esa fecha.
                </p>
              </div>
            ) : null}

            {excelError ? (
              <p id={excelErrId} role="alert" className="text-sm text-red-300">
                {excelError}
              </p>
            ) : null}

            {ingresos > 0 ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-zinc-900/50 p-3">
                <p className="text-xs text-zinc-400 text-pretty">
                  <span className="tabular-nums font-medium text-zinc-200">
                    {ingresos}
                  </span>{" "}
                  ingresos en esta sesión
                  {viaAgente ? " · Hermes" : null}
                  {sinHora ? " · sin hora" : null}
                  {usados.length > 0 ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="tabular-nums">{usados.length}</span>{" "}
                      usados
                    </>
                  ) : null}
                </p>
                <ul className="flex max-h-24 flex-col gap-1 overflow-y-auto text-xs text-zinc-500">
                  {archivosNombres.map((n) => (
                    <li key={n} className="flex items-start gap-1.5 truncate">
                      <FileSpreadsheetIcon
                        className="mt-0.5 size-3 shrink-0"
                        aria-hidden
                      />
                      <span className="truncate" title={n}>
                        {n}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-zinc-400">
                En la Spark
                {cargandoExtractos ? "…" : null}
              </p>
              {extractosSpark.length > 0 ? (
                <ul className="pagos-think-scroll flex max-h-48 flex-col gap-2">
                  {extractosSpark.map((e) => (
                    <li
                      key={e.id}
                      className={`rounded-lg border px-2.5 py-2 text-xs ${
                        e.activo
                          ? "border-zinc-600 bg-zinc-900/70"
                          : "border-border bg-zinc-950/50"
                      }`}
                    >
                      <p className="truncate font-medium text-zinc-200" title={e.nombre}>
                        {e.nombre}
                      </p>
                      <p className="mt-0.5 tabular-nums text-zinc-500">
                        {e.filas} filas
                        {e.fecha_min && e.fecha_max
                          ? e.fecha_min === e.fecha_max
                            ? ` · ${e.fecha_min}`
                            : ` · ${e.fecha_min} → ${e.fecha_max}`
                          : null}
                        {e.activo ? " · activo" : null}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : !cargandoExtractos ? (
                <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-3 py-4">
                  <p className="text-sm font-medium text-zinc-300">
                    Sin extractos en Spark
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 text-pretty">
                    Carga un Excel; queda guardado para cruzar por fecha.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="pagos-main"
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          >
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
              {!tieneThread ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-zinc-900/60">
                    <ImageIcon
                      className="size-5 text-zinc-400"
                      aria-hidden
                    />
                  </div>
                  <h2 className="text-lg font-medium tracking-tight text-foreground text-balance">
                    Pega un comprobante o escribe un mensaje
                  </h2>
                  <p className="max-w-md text-sm text-muted-foreground text-pretty">
                    {tieneExtracto
                      ? "Pega el voucher: si falta el extracto de ese día, te lo pedimos."
                      : "Puedes pegar el comprobante ya. Si no hay extracto del día en la Spark, te pediremos cargarlo."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {pensamientos.length > 0 ||
                  comprobando ||
                  resultado != null ? (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-stretch">
                      {pensamientos.length > 0 || comprobando ? (
                        <div
                          className={`pagos-think-shell h-full max-h-[min(28rem,52vh)] rounded-2xl border border-border bg-zinc-900/40 ${comprobando ? "pagos-think-shell--active" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => setPensarAbierto((v) => !v)}
                            className="pagos-think-font flex w-full min-h-10 shrink-0 items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/40 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-expanded={pensarAbierto}
                            aria-controls={pensarPanelId}
                          >
                            <ChevronDownIcon
                              className={`size-4 shrink-0 transition-transform motion-reduce:transition-none ${pensarAbierto ? "" : "-rotate-90"}`}
                              aria-hidden
                            />
                            <span
                              className={`flex-1 ${comprobando ? "pagos-think-label--active" : ""}`}
                            >
                              {comprobando ? "Pensando…" : "Pensamiento"}
                            </span>
                            {!comprobando && pensamientos.length > 0 ? (
                              <span className="tabular-nums text-zinc-600">
                                {pensamientos.length}
                              </span>
                            ) : null}
                          </button>
                          {pensarAbierto ? (
                            <div
                              id={pensarPanelId}
                              ref={pensarScrollRef}
                              className="pagos-think-scroll border-t border-border/80 px-4 py-3"
                            >
                              <PagosPensamientoTypewriter
                                lines={pensamientos}
                                active={comprobando}
                                onReveal={scrollPensamiento}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div
                          className="hidden min-h-[18rem] rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 lg:block"
                          aria-hidden
                        />
                      )}

                      {resultado ? (
                        <article
                          className={`pagos-think-scroll flex h-full max-h-[min(28rem,52vh)] flex-col rounded-2xl border p-5 ${
                            alertaReuso?.activa
                              ? "border-amber-500/60 bg-amber-950/40"
                              : "border-border bg-zinc-900/60"
                          }`}
                        >
                          {alertaReuso?.activa ? (
                            <div
                              role="alert"
                              className="mb-4 shrink-0 rounded-xl border border-amber-400/50 bg-amber-500/15 px-4 py-3"
                            >
                              <div className="flex items-start gap-3">
                                <TriangleAlertIcon
                                  className="mt-0.5 size-5 shrink-0 text-amber-300"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-base font-semibold tracking-tight text-amber-100">
                                    Comprobante ya validado
                                  </p>
                                  <p className="mt-1 text-sm leading-relaxed text-amber-50/90 text-pretty">
                                    {alertaReuso.aviso ??
                                      "Este comprobante ya se validó antes. Posible reuso entre personas."}
                                  </p>
                                  {(alertaReuso.veces != null ||
                                    alertaReuso.primera_vez) && (
                                    <p className="mt-2 text-xs font-medium tabular-nums text-amber-200/90">
                                      {alertaReuso.veces != null
                                        ? `Ya va ${alertaReuso.veces} ${alertaReuso.veces === 1 ? "vez" : "veces"}`
                                        : null}
                                      {alertaReuso.veces != null &&
                                      alertaReuso.primera_vez
                                        ? " · "
                                        : null}
                                      {alertaReuso.primera_vez
                                        ? `Primera vez: ${formatearPrimeraVez(alertaReuso.primera_vez)}`
                                        : null}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : null}

                          <div className="flex items-start gap-3">
                            <IconoVeredicto v={resultado.veredicto} />
                            <div className="min-w-0 flex-1">
                              <p className="text-base font-semibold text-white">
                                {etiquetaVeredicto(resultado.veredicto)}
                                {alertaReuso?.activa ? (
                                  <span className="ml-2 text-sm font-medium text-amber-300">
                                    · con alerta de reuso
                                  </span>
                                ) : null}
                              </p>
                              {(alertaReuso?.activa
                                ? alertaReuso.cuerpo
                                : resultado.resumen) ? (
                                <p className="mt-1 text-sm leading-relaxed text-zinc-300 text-pretty">
                                  {alertaReuso?.activa
                                    ? alertaReuso.cuerpo
                                    : resultado.resumen}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {resultado.ocr ? (
                            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/80 pt-4 text-sm sm:grid-cols-3">
                              <div>
                                <dt className="text-xs text-zinc-500">
                                  Monto leído
                                </dt>
                                <dd className="mt-0.5 tabular-nums font-medium text-zinc-200">
                                  {formatearCOP(resultado.ocr.monto_cop)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-zinc-500">
                                  Fecha y hora
                                </dt>
                                <dd className="mt-0.5 tabular-nums font-medium text-zinc-200">
                                  {resultado.ocr.fecha}{" "}
                                  {resultado.ocr.hora.slice(0, 5)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-zinc-500">
                                  Lecturas OCR
                                </dt>
                                <dd className="mt-0.5 tabular-nums text-zinc-200">
                                  {resultado.ocr.votos}/
                                  {resultado.ocr.total_ocr}
                                </dd>
                              </div>
                            </dl>
                          ) : null}
                          {resultado.candidato ? (
                            <p className="mt-3 text-sm text-zinc-400 text-pretty">
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
                        </article>
                      ) : comprobando ? (
                        <div className="flex min-h-[18rem] items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-5 py-8 text-center">
                          <div>
                            <Loader2Icon
                              className="mx-auto size-5 animate-spin text-zinc-400 motion-reduce:animate-none"
                              aria-hidden
                            />
                            <p className="mt-3 text-sm font-medium text-zinc-300">
                              Esperando veredicto…
                            </p>
                            <p className="mt-1 text-xs text-zinc-500 text-pretty">
                              El resultado aparecerá aquí al terminar el cruce.
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {mensajes.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-sm leading-relaxed text-pretty ${
                          m.role === "user"
                            ? "bg-zinc-100 text-zinc-950"
                            : "border border-border bg-zinc-900/60 text-zinc-200"
                        }`}
                      >
                        <ChatMarkdown
                          text={m.content}
                          tone={m.role === "user" ? "light" : "dark"}
                        />
                      </div>
                    </div>
                  ))}

                  {enviando ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl border border-border bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
                        <Loader2Icon
                          className="size-4 animate-spin motion-reduce:animate-none"
                          aria-hidden
                        />
                        <span className="sr-only">Escribiendo respuesta…</span>
                      </div>
                    </div>
                  ) : null}

                  <div ref={threadEndRef} className="h-px w-full shrink-0" />
                </div>
              )}
            </div>
          </main>

          {/* Composer sticky */}
          <div className="shrink-0 border-t border-border bg-zinc-950/95 px-6 py-4 backdrop-blur-sm">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
              <input
                ref={fotoRef}
                id={fotoId}
                type="file"
                accept="image/*"
                aria-invalid={fotoError ? true : undefined}
                aria-describedby={fotoError ? fotoErrId : undefined}
                disabled={comprobando || enviando}
                onChange={(e) => void onFoto(e.target.files?.[0])}
                className="sr-only"
              />

              <div
                ref={pegarZonaRef}
                role="group"
                aria-label="Mensaje y comprobante"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropActive(false);
                  if (comprobando || enviando) return;
                  const file = e.dataTransfer.files?.[0];
                  if (file) void onFoto(file);
                }}
                className={`rounded-2xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring ${
                  dropActive
                    ? "border-zinc-400 bg-zinc-800/60"
                    : "border-zinc-700 bg-zinc-900/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt={
                        fotoNombre
                          ? `Vista previa del comprobante ${fotoNombre}`
                          : "Vista previa del comprobante de pago"
                      }
                      className="size-14 shrink-0 rounded-lg border border-zinc-700 object-cover outline outline-1 outline-white/10"
                    />
                  ) : (
                    <button
                      type="button"
                      className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-600 bg-zinc-900 text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={comprobando || enviando}
                      onClick={() => fotoRef.current?.click()}
                      aria-label="Elegir imagen del comprobante"
                    >
                      <ImageIcon className="size-5" aria-hidden />
                    </button>
                  )}

                  <label htmlFor="pagos-draft" className="sr-only">
                    Mensaje
                  </label>
                  <textarea
                    ref={draftRef}
                    id="pagos-draft"
                    rows={2}
                    value={draft}
                    disabled={enviando || comprobando}
                    placeholder="Escribe un mensaje… (Enter envía · Shift+Enter nueva línea)"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.shiftKey) return;
                      if (e.ctrlKey || e.metaKey) return; // Ctrl+Enter = comprobar (global)
                      e.preventDefault();
                      void enviarMensaje();
                    }}
                    className="min-h-[2.75rem] w-full resize-none bg-transparent text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                  <p className="mr-auto text-xs text-zinc-500">
                    {fotoNombre
                      ? fotoNombre
                      : "Adjunta o pega (Ctrl+V) un comprobante"}
                    {" · "}
                    Ctrl+Enter comprueba
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-xl"
                    disabled={comprobando || enviando}
                    onClick={() => fotoRef.current?.click()}
                  >
                    Elegir imagen
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 rounded-xl gap-1.5"
                    disabled={
                      enviando || comprobando || !draft.trim() || subiendoExcel
                    }
                    aria-busy={enviando}
                    onClick={() => void enviarMensaje()}
                  >
                    {enviando ? (
                      <Loader2Icon
                        className="size-4 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : (
                      <SendIcon className="size-4" aria-hidden />
                    )}
                    Enviar
                  </Button>
                  <Button
                    type="button"
                    className="h-9 min-w-[8.5rem] rounded-xl px-3 text-sm font-semibold active:scale-[0.96] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100"
                    disabled={comprobando || subiendoExcel || enviando}
                    aria-busy={comprobando}
                    onClick={() => void comprobar()}
                  >
                    {comprobando ? (
                      <>
                        <Loader2Icon
                          className="size-4 animate-spin motion-reduce:animate-none"
                          aria-hidden
                        />
                        Comprobar pago
                      </>
                    ) : (
                      "Comprobar pago"
                    )}
                  </Button>
                </div>
              </div>

              {fotoError ? (
                <p id={fotoErrId} role="alert" className="text-sm text-red-300">
                  {fotoError}
                </p>
              ) : null}

              {formError ? (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              <p className="text-xs text-zinc-600">
                {extractosSpark.length > 0
                  ? `${extractosSpark.length} extracto(s) en Spark${ingresos ? ` · ${ingresos} en sesión` : ""}`
                  : ingresos
                    ? `${ingresos} ingresos en sesión`
                    : "Sin extracto — se pedirá según la fecha del comprobante"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PagosPage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <MasterGate title="Pagos" subtitle="Escribe la clave para continuar">
        <PagosWorkspace />
      </MasterGate>
    </div>
  );
}
