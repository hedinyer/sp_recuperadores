"use client";

import { useCallback, useRef, useState } from "react";

import { HistorialPlaca } from "@/components/HistorialPlaca";
import { NavFooter } from "@/components/NavFooter";
import type { ItemHistorialPlaca } from "@/lib/historialPlaca";
import {
  etiquetaRecuperador,
  RECUPERADORES_FIJOS,
} from "@/lib/recuperadores";
import {
  enlaceGoogleMaps,
  mensajeErrorGps,
  obtenerGpsUbicacion,
} from "@/lib/geolocation";
import { formatFechaCorta } from "@/lib/fechas";
import { FotoComprobante } from "@/components/FotoComprobante";
import { AvisoGpsPendiente, UbicacionGpsMoto } from "@/components/UbicacionGpsMoto";
import {
  leerFotoDeCache,
  normalizarPlaca,
  prepararFotoPresencial,
} from "@/lib/fotoComprobante";
import {
  abrirWhatsAppConTexto,
  capturarReciboPng,
  compartirReciboWhatsApp,
  descargarBlob,
  dataUrlToBlob,
} from "@/lib/reciboImagen";
import type { UbicacionGpsMoto as UbicacionGps } from "@/lib/ubicacionGps";

type Vehiculo = Record<string, string>;
type TipoRecibo = "pago" | "recuperada";
type MetodoPago = "Efectivo" | "Nequi" | "Transferencia";
type PagoPaso = "montos" | "metodo" | "modalidad" | "foto";

const METODOS_PAGO: MetodoPago[] = ["Efectivo", "Nequi", "Transferencia"];

function formatearCOP(val: string | undefined): string {
  if (val == null || val === "") return "—";
  const n = Number(String(val).replace(/,/g, ""));
  if (Number.isNaN(n)) return val;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function enlaceWhatsApp(telefono: string | undefined): string | null {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, "");
  if (!digits) return null;
  const conPais = digits.startsWith("57")
    ? digits
    : digits.startsWith("0")
      ? `57${digits.slice(1)}`
      : `57${digits}`;
  return `https://wa.me/${conPais}`;
}

function limpiarNumero(valor: string): string {
  return valor.replace(/\D/g, "");
}

function formatearConPuntos(valor: string): string {
  const limpio = limpiarNumero(valor);
  if (!limpio) return "";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 0,
  }).format(Number(limpio));
}

function StatMini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-2 py-3 min-w-0 text-center">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500 leading-tight">
        {label}
      </span>
      <span
        className={`mt-1 text-sm font-semibold tabular-nums leading-tight ${
          accent ? "text-amber-400" : "text-zinc-100"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function formatCuotasMora(cuotasPend: number | null): string {
  if (cuotasPend == null || Number.isNaN(cuotasPend) || cuotasPend <= 0) {
    return "0";
  }
  return cuotasPend % 1 === 0
    ? String(Math.round(cuotasPend))
    : cuotasPend.toFixed(1);
}

export default function Home() {
  const [placa, setPlaca] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<Vehiculo | null>(null);
  const [gpsMoto, setGpsMoto] = useState<UbicacionGps | null>(null);
  const [gpsMotoTipo, setGpsMotoTipo] = useState("iop gps");
  const [gpsMensaje, setGpsMensaje] = useState<string | null>(null);

  const [pagoPaso, setPagoPaso] = useState<PagoPaso | null>(null);
  const [montoPago, setMontoPago] = useState("");
  const [montoMulta, setMontoMulta] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPago | "">("");
  const [esPresencial, setEsPresencial] = useState<boolean | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [gpsCapturado, setGpsCapturado] = useState<string | null>(null);
  const [solicitandoGps, setSolicitandoGps] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [mensajeInfo, setMensajeInfo] = useState<string | null>(null);
  const [recuperadorRecibo, setRecuperadorRecibo] = useState("");
  const [recibo, setRecibo] = useState<{
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
    /** Data URL local para exportar sin CORS */
    fotoLocal?: string;
    gpsUbicacion?: string;
  } | null>(null);
  const [exportandoRecibo, setExportandoRecibo] = useState(false);
  const [pasoRecuperada, setPasoRecuperada] = useState<"confirmar" | "recibo" | null>(
    null,
  );
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [mostrarGps, setMostrarGps] = useState(false);
  const [historialItems, setHistorialItems] = useState<ItemHistorialPlaca[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);

  const reciboRef = useRef<HTMLDivElement>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const cerrarWizardPago = useCallback(() => {
    setPagoPaso(null);
    setMontoPago("");
    setMontoMulta("");
    setMetodoPago("");
    setEsPresencial(null);
    setFotoPreview(null);
    setFotoFile(null);
    setGpsCapturado(null);
    setSolicitandoGps(false);
  }, []);

  const capturarGps = useCallback(async (): Promise<boolean> => {
    setSolicitandoGps(true);
    setError(null);
    const resultado = await obtenerGpsUbicacion();
    setSolicitandoGps(false);
    if (resultado.ok) {
      setGpsCapturado(resultado.coords);
      return true;
    }
    setError(mensajeErrorGps(resultado.motivo));
    return false;
  }, []);

  const requiereGpsPago =
    metodoPago === "Efectivo" || esPresencial === true;

  const elegirPresencial = useCallback(async () => {
    setEsPresencial(true);
    if (gpsCapturado) {
      setPagoPaso("foto");
      return;
    }
    const ok = await capturarGps();
    if (ok) setPagoPaso("foto");
  }, [capturarGps, gpsCapturado]);

  const avanzarAModalidad = useCallback(async () => {
    if (metodoPago === "Efectivo" && !gpsCapturado) {
      const ok = await capturarGps();
      if (!ok) return;
    }
    setPagoPaso("modalidad");
  }, [metodoPago, gpsCapturado, capturarGps]);

  const totalPasosPago = esPresencial === true ? 4 : 3;
  const indicePasoPago =
    pagoPaso === "montos"
      ? 1
      : pagoPaso === "metodo"
        ? 2
        : pagoPaso === "modalidad"
          ? 3
          : pagoPaso === "foto"
            ? 4
            : 0;

  const onSeleccionarFoto = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !v?.placa) return;
      setProcesandoFoto(true);
      setError(null);
      try {
        const placaNorm = normalizarPlaca(v.placa);
        const { dataUrl, file: comprimido } = await prepararFotoPresencial(
          placaNorm,
          file,
        );
        setFotoFile(comprimido);
        setFotoPreview(dataUrl);
      } catch {
        setError("No se pudo procesar la foto. Intenta de nuevo.");
        setFotoFile(null);
        setFotoPreview(null);
      } finally {
        setProcesandoFoto(false);
      }
    },
    [v?.placa],
  );

  const consultar = useCallback(async () => {
    const p = placa.trim();
    if (!p) {
      setError("Escribe una placa");
      return;
    }
    setLoading(true);
    setError(null);
    setMensajeInfo(null);
    setV(null);
    setGpsMoto(null);
    setGpsMensaje(null);
    setRecibo(null);
    setPasoRecuperada(null);
    setMostrarHistorial(false);
    setMostrarGps(false);
    setHistorialItems([]);
    setHistorialError(null);
    cerrarWizardPago();
    try {
      const res = await fetch(
        `/api/placa?placa=${encodeURIComponent(p)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al consultar");
        return;
      }
      setV(data.vehiculo as Vehiculo);
      setGpsMoto(data.gps ?? null);
      setGpsMotoTipo(String(data.gps_moto ?? data.gps_proveedor ?? "iop gps"));
      setGpsMensaje(data.gps_mensaje ?? null);
      const asigPend = data.asignacion_pendiente as
        | { nombre_recuperador?: string | null }
        | null
        | undefined;
      setRecuperadorRecibo(
        asigPend?.nombre_recuperador
          ? String(asigPend.nombre_recuperador).trim()
          : "",
      );
    } catch {
      setError("Sin conexión o error de red");
    } finally {
      setLoading(false);
    }
  }, [placa, cerrarWizardPago]);

  const actualizarGps = useCallback(async () => {
    const p = (v?.placa || placa).trim();
    if (!p) return;
    try {
      const res = await fetch(
        `/api/placa?placa=${encodeURIComponent(p)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (res.ok) {
        setGpsMoto(data.gps ?? null);
        setGpsMotoTipo(String(data.gps_moto ?? data.gps_proveedor ?? "iop gps"));
        setGpsMensaje(data.gps_mensaje ?? null);
      }
    } catch {
      // ignore
    }
  }, [v?.placa, placa]);

  const cargarHistorial = useCallback(async (placaConsulta: string) => {
    setHistorialLoading(true);
    setHistorialError(null);
    try {
      const res = await fetch(
        `/api/placa/historial?placa=${encodeURIComponent(placaConsulta)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) {
        setHistorialError(data.error ?? "No se pudo cargar el historial");
        setHistorialItems([]);
        return;
      }
      setHistorialItems(data.items ?? []);
    } catch {
      setHistorialError("Sin conexión al cargar historial");
      setHistorialItems([]);
    } finally {
      setHistorialLoading(false);
    }
  }, []);

  const alternarHistorial = useCallback(() => {
    if (!v?.placa) return;
    setMostrarHistorial((prev) => {
      const abrir = !prev;
      if (abrir) void cargarHistorial(v.placa);
      return abrir;
    });
  }, [v?.placa, cargarHistorial]);

  const alternarGps = useCallback(() => {
    setMostrarGps((prev) => !prev);
  }, []);

  const generarRecibo = useCallback(async () => {
    if (!v || !recuperadorRecibo || !metodoPago || esPresencial == null) return;
    if (esPresencial && !fotoFile) {
      setError("Toma la foto del pago presencial");
      return;
    }

    const placaNormalizada = (v.placa || "—").toUpperCase().replace(/\s/g, "");
    setGuardandoPago(true);
    setError(null);

    let fotoUrl: string | undefined;
    try {
      const subirFoto =
        esPresencial && fotoFile
          ? (async () => {
              const fd = new FormData();
              fd.append("file", fotoFile);
              fd.append("placa", placaNormalizada);
              const resFoto = await fetch("/api/recuperadores/foto", {
                method: "POST",
                body: fd,
              });
              const dataFoto = await resFoto.json();
              if (!resFoto.ok) {
                throw new Error(dataFoto.error ?? "No se pudo guardar la foto");
              }
              return dataFoto.foto as string;
            })()
          : Promise.resolve(undefined);

      if (requiereGpsPago && !gpsCapturado) {
        setError(
          metodoPago === "Efectivo"
            ? "Activa la ubicación GPS (pago en efectivo)."
            : "Activa la ubicación en el paso presencial antes de continuar.",
        );
        return;
      }

      const [fotoSubida] = await Promise.all([subirFoto]);
      fotoUrl = fotoSubida;
      const gpsUbicacion = gpsCapturado;

      const now = new Date();
      const dd = String(now.getDate()).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yy = String(now.getFullYear()).slice(-2);
      const rand = String(Math.floor(10000 + Math.random() * 90000));
      const referencia = `${dd}${mm}${yy}${rand}`;

      const pago = Number(limpiarNumero(montoPago)) || 0;
      const multa = Number(limpiarNumero(montoMulta)) || 0;

      const fotoLocal = esPresencial
        ? (await leerFotoDeCache(placaNormalizada)) ??
          (fotoPreview ?? undefined)
        : undefined;

      const res = await fetch("/api/recuperadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_recuperador: recuperadorRecibo,
          placa_asignada: placaNormalizada,
          estado_moto: "Abonó",
          pagado: pago,
          multa,
          tipo_pago: metodoPago,
          presencial: esPresencial,
          foto: fotoUrl ?? null,
          gps_ubicacion: gpsUbicacion,
          desde_consultar: true,
        }),
      });
      if (!res.ok) {
        const dataErr = await res.json().catch(() => ({}));
        setError(
          (dataErr as { error?: string }).error ??
            "No se pudo guardar el abono en el servidor",
        );
        return;
      }

      setRecibo({
        referencia,
        fecha: `${dd}/${mm}/${String(now.getFullYear())}`,
        recuperador: recuperadorRecibo,
        cliente: v?.nombre || "—",
        cedula: v?.cedula || "—",
        placa: placaNormalizada,
        montoPago: pago,
        montoMulta: multa,
        total: pago - multa,
        tipo: "pago",
        tipoPago: metodoPago,
        presencial: esPresencial,
        fotoUrl,
        fotoLocal,
        gpsUbicacion: gpsUbicacion ?? undefined,
      });
      cerrarWizardPago();
      setMensajeInfo(`Placa ${placaNormalizada} registrada como Abonó`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sin conexión al guardar el pago",
      );
    } finally {
      setGuardandoPago(false);
    }
  }, [
    montoPago,
    montoMulta,
    v,
    recuperadorRecibo,
    metodoPago,
    esPresencial,
    fotoFile,
    fotoPreview,
    gpsCapturado,
    requiereGpsPago,
    cerrarWizardPago,
  ]);

  const iniciarReciboRecuperada = useCallback(() => {
    if (!v || !recuperadorRecibo) {
      setError("Selecciona recuperador para recuperar la moto");
      return;
    }
    setError(null);
    setPasoRecuperada("confirmar");
  }, [v, recuperadorRecibo]);

  const generarReciboRecuperada = useCallback(async () => {
    if (!v || !recuperadorRecibo) return;
    setError(null);
    setMensajeInfo(null);
    setSolicitandoGps(true);
    const gpsResult = await obtenerGpsUbicacion();
    setSolicitandoGps(false);
    if (!gpsResult.ok) {
      setError(mensajeErrorGps(gpsResult.motivo));
      return;
    }
    const gpsUbicacion = gpsResult.coords;
    const placaNormalizada = (v?.placa || "—").toUpperCase().replace(/\s/g, "");
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const rand = String(Math.floor(10000 + Math.random() * 90000));
    const referencia = `${dd}${mm}${yy}${rand}`;

    try {
      const res = await fetch("/api/recuperadores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_recuperador: recuperadorRecibo,
          placa_asignada: placaNormalizada,
          estado_moto: "recuperada",
          pagado: 0,
          multa: 0,
          gps_ubicacion: gpsUbicacion,
          desde_consultar: true,
        }),
      });
      if (!res.ok) {
        const dataErr = await res.json().catch(() => ({}));
        setError(
          (dataErr as { error?: string }).error ??
            "No se pudo marcar la moto como recuperada",
        );
        return;
      }

      setRecibo({
        referencia,
        fecha: `${dd}/${mm}/${String(now.getFullYear())}`,
        recuperador: recuperadorRecibo,
        cliente: v?.nombre || "—",
        cedula: v?.cedula || "—",
        placa: placaNormalizada,
        montoPago: 0,
        montoMulta: 0,
        total: 0,
        tipo: "recuperada",
        gpsUbicacion,
      });
      setPasoRecuperada(null);
      setMensajeInfo(`Moto ${placaNormalizada} marcada como recuperada`);
    } catch {
      setError("Sin conexión para guardar la recuperación");
    }
  }, [v, recuperadorRecibo]);

  const compartirReciboWpp = useCallback(async () => {
    if (!recibo || exportandoRecibo) return;
    setExportandoRecibo(true);
    setError(null);
    setMensajeInfo(null);

    const titulo =
      recibo.tipo === "pago"
        ? "RECIBO DE PAGO"
        : "RECIBO DE MOTO RECUPERADA";

    const lineas = [
      `🧾 *${titulo}*`,
      `─────────────────`,
      `Cliente: ${recibo.cliente}`,
      `Cédula: ${recibo.cedula}`,
      `Placa: ${recibo.placa}`,
      `Recuperador: ${recibo.recuperador}`,
      `Fecha: ${recibo.fecha}`,
    ];

    if (recibo.tipo === "pago") {
      lineas.push(
        `─────────────────`,
        `Método: ${recibo.tipoPago ?? "—"}`,
        `Pago: ${recibo.presencial ? "Presencial" : "Remoto"}`,
        `Abono: ${formatearCOP(String(recibo.montoPago))}`,
        `Multa: ${formatearCOP(String(recibo.montoMulta))}`,
        `*Neto abonado: ${formatearCOP(String(recibo.total))}*`,
      );
    }

    if (recibo.gpsUbicacion) {
      lineas.push(`Ubicación: ${enlaceGoogleMaps(recibo.gpsUbicacion)}`);
    }

    lineas.push(`─────────────────`, `*Ref: ${recibo.referencia}*`, `─────────────────`);

    const texto = lineas.join("\n");

    const nombreArchivo = `recibo_${recibo.referencia}.png`;

    try {
      if (reciboRef.current) {
        const dataUrl = await capturarReciboPng(reciboRef.current);
        const modo = await compartirReciboWhatsApp(
          texto,
          dataUrl,
          nombreArchivo,
        );
        if (modo === "share") {
          setMensajeInfo(
            "Elige WhatsApp en el menú y envía la imagen del recibo (ya incluye el comprobante).",
          );
        } else if (modo === "wa_y_descarga") {
          setMensajeInfo(
            "Se descargó el recibo y se abrió WhatsApp. Toca 📎 y adjunta la imagen descargada.",
          );
        }
        return;
      }
      abrirWhatsAppConTexto(texto);
    } catch {
      setError("No se pudo generar la imagen del recibo.");
      abrirWhatsAppConTexto(texto);
    } finally {
      setExportandoRecibo(false);
    }
  }, [recibo, exportandoRecibo]);

  const descargarRecibo = useCallback(async () => {
    if (!reciboRef.current || !recibo || exportandoRecibo) return;
    setExportandoRecibo(true);
    setError(null);
    setMensajeInfo(null);
    try {
      const dataUrl = await capturarReciboPng(reciboRef.current);
      descargarBlob(
        dataUrlToBlob(dataUrl),
        `recibo_${recibo.referencia}.png`,
      );
    } catch {
      setError("No se pudo descargar el recibo. Intenta de nuevo.");
    } finally {
      setExportandoRecibo(false);
    }
  }, [recibo, exportandoRecibo]);

  const wa = v ? enlaceWhatsApp(v.telefono) : null;
  const cuotasPendRaw =
    v?.cuotas_pendientes != null && String(v.cuotas_pendientes).trim() !== ""
      ? parseFloat(String(v.cuotas_pendientes))
      : null;
  const cuotasPend =
    cuotasPendRaw != null && !Number.isNaN(cuotasPendRaw) ? cuotasPendRaw : null;

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="shrink-0 px-4 pb-3 border-b border-zinc-800/80">
        <h1 className="text-base font-semibold tracking-tight text-white">
          Consulta por placa
        </h1>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Deuda y contacto del cliente
        </p>
      </header>

      <main className="flex-1 w-full max-w-[414px] mx-auto px-3 sm:px-4 pt-3 flex flex-col gap-3 min-h-0">
        <div className="shrink-0 flex flex-col gap-1.5">
          <label htmlFor="placa" className="text-xs text-zinc-400 pl-0.5">
            Placa
          </label>
          <div className="flex gap-2">
            <input
              id="placa"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Ej. TIJ66H"
              value={placa}
              onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && consultar()}
              className="flex-1 min-h-[50px] rounded-xl bg-zinc-900 border border-zinc-700 px-3.5 text-lg font-semibold tracking-[0.12em] text-white placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
            />
            <button
              type="button"
              onClick={consultar}
              disabled={loading}
              className="shrink-0 min-h-[50px] min-w-[88px] rounded-xl bg-emerald-600 text-white font-semibold text-sm px-4 disabled:opacity-50 active:scale-[0.98] transition-transform touch-manipulation"
            >
              {loading ? "…" : "Buscar"}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="shrink-0 rounded-xl border border-red-900/60 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {mensajeInfo && (
          <div className="shrink-0 rounded-xl border border-emerald-800/60 bg-emerald-950/40 px-3.5 py-2.5 text-sm text-emerald-200">
            {mensajeInfo}
          </div>
        )}

        {v && (
          <>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
              <label className="text-xs text-zinc-400 pl-0.5 block mb-1">
                Recuperador
              </label>
              <select
                value={recuperadorRecibo}
                onChange={(e) => setRecuperadorRecibo(e.target.value)}
                className="w-full min-h-[44px] rounded-xl bg-zinc-800 border border-zinc-700 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">Seleccionar recuperador</option>
                {RECUPERADORES_FIJOS.map((nom) => (
                  <option key={nom} value={nom}>
                    {etiquetaRecuperador(nom)}
                  </option>
                ))}
              </select>
            </section>
            <article className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-lg shadow-black/30">
              {/* Placa */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-zinc-900 border-b border-zinc-800">
                <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                  Moto
                </span>
                <span className="text-2xl font-bold tracking-[0.2em] text-white">
                  {(v.placa || "—").toUpperCase().replace(/\s/g, "")}
                </span>
              </div>

              {/* Deuda */}
              <section className="px-4 pt-4 pb-3 bg-gradient-to-b from-rose-950/70 via-rose-950/30 to-transparent border-b border-zinc-800/80">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-rose-300/90">
                    Valor para estar al día
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0 -mt-0.5">
                    <button
                      type="button"
                      onClick={alternarGps}
                      aria-expanded={mostrarGps}
                      aria-label={
                        mostrarGps
                          ? "Ocultar ubicación GPS"
                          : "Ver ubicación GPS"
                      }
                      className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border touch-manipulation transition-colors ${
                        mostrarGps
                          ? "border-emerald-600/60 bg-emerald-950/50 text-emerald-200"
                          : "border-zinc-700/80 bg-zinc-900/60 text-zinc-400 active:bg-zinc-800"
                      }`}
                    >
                      <svg
                        aria-hidden
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={alternarHistorial}
                      aria-expanded={mostrarHistorial}
                      aria-label={
                        mostrarHistorial
                          ? "Ocultar historial de cobros y recogidas"
                          : "Ver historial de cobros y recogidas"
                      }
                      className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border touch-manipulation transition-colors ${
                        mostrarHistorial
                          ? "border-rose-600/60 bg-rose-950/50 text-rose-200"
                          : "border-zinc-700/80 bg-zinc-900/60 text-zinc-400 active:bg-zinc-800"
                      }`}
                    >
                      <svg
                        aria-hidden
                        className="w-5 h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M4 7h16M4 12h16M4 17h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[clamp(1.75rem,8vw,2.25rem)] font-bold text-rose-400 tabular-nums leading-none tracking-tight">
                  {formatearCOP(v.deuda_total)}
                </p>
              </section>

              {mostrarGps ? (
                gpsMoto ? (
                  <UbicacionGpsMoto
                    key={`gps-${(v.placa || placa).toUpperCase().replace(/\s/g, "")}`}
                    placa={(v.placa || placa).toUpperCase().replace(/\s/g, "")}
                    gps={gpsMoto}
                    gpsMoto={gpsMotoTipo}
                    activo={mostrarGps}
                    onActualizar={actualizarGps}
                  />
                ) : gpsMensaje ? (
                  <AvisoGpsPendiente mensaje={gpsMensaje} />
                ) : (
                  <section className="px-4 py-3 border-b border-zinc-800 bg-emerald-950/10">
                    <p className="text-sm text-zinc-500 text-center">
                      Sin datos de GPS para esta placa
                    </p>
                  </section>
                )
              ) : null}

              <section className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800 bg-zinc-900/40">
                <StatMini
                  label="Cuotas en mora"
                  value={formatCuotasMora(cuotasPend)}
                  accent={(cuotasPend ?? 0) >= 5}
                />
                <StatMini
                  label="Últ. pago"
                  value={formatFechaCorta(v.ultimo_pago)}
                />
                <StatMini
                  label="Cuota"
                  value={formatearCOP(v.valor_cuota).replace(/\s/g, "\u00a0")}
                />
              </section>

              {/* Cliente */}
              <section className="px-4 py-3.5 border-b border-zinc-800">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5">
                  Cliente
                </h2>
                <p className="text-base font-semibold text-zinc-50 leading-snug break-words">
                  {v.nombre || "—"}
                </p>
                <p className="mt-1.5 text-sm text-zinc-400 tabular-nums">
                  CC{" "}
                  <span className="text-zinc-200 font-medium">
                    {v.cedula || "—"}
                  </span>
                </p>
                {v.visitador && v.visitador !== "-" ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Visitador:{" "}
                    <span className="text-zinc-400">{v.visitador}</span>
                  </p>
                ) : null}
              </section>

              {/* Contacto */}
              <section className="px-4 py-3.5 flex flex-col gap-2.5">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Contacto
                </h2>
                {v.telefono ? (
                  <a
                    href={`tel:${v.telefono.replace(/\s/g, "")}`}
                    className="flex items-center justify-center min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-800/50 text-base font-medium text-zinc-100 tabular-nums active:bg-zinc-800 touch-manipulation"
                  >
                    {v.telefono}
                  </a>
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-2">
                    Sin teléfono registrado
                  </p>
                )}
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 min-h-[50px] w-full rounded-xl bg-[#25D366] text-base font-semibold text-white shadow-md shadow-[#25D366]/20 active:scale-[0.98] transition-transform touch-manipulation"
                  >
                    <svg
                      aria-hidden
                      className="w-5 h-5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Escribir por WhatsApp
                  </a>
                ) : null}
              </section>

              {/* Contrato */}
              <footer className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 bg-zinc-950/60 border-t border-zinc-800 text-xs">
                <div>
                  <span className="text-zinc-500">Inicio contrato</span>
                  <p className="mt-0.5 font-medium text-zinc-300 tabular-nums">
                    {formatFechaCorta(v.fecha_inicio)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-zinc-500">Cuotas pagadas</span>
                  <p className="mt-0.5 font-medium text-zinc-300 tabular-nums">
                    {v.cuotas_pagadas ?? "—"} / {v.cuotas_generadas ?? "—"}
                  </p>
                </div>
              </footer>
            </article>

            {mostrarHistorial ? (
              <HistorialPlaca
                items={historialItems}
                loading={historialLoading}
                error={historialError}
              />
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!recuperadorRecibo) {
                    setError("Selecciona recuperador antes de generar pago");
                    return;
                  }
                  setError(null);
                  setPagoPaso("montos");
                }}
                className="flex-1 min-h-[50px] rounded-xl bg-emerald-700 text-white font-semibold text-base active:scale-[0.98] transition-transform touch-manipulation shadow-lg shadow-emerald-900/30"
              >
                Generar Pago
              </button>
              <button
                type="button"
                onClick={iniciarReciboRecuperada}
                className="flex-1 min-h-[50px] rounded-xl bg-blue-700 text-white font-semibold text-base active:scale-[0.98] transition-transform touch-manipulation shadow-lg shadow-blue-900/30"
              >
                Moto Recuperada
              </button>
            </div>
          </>
        )}

        {/* Recibo generado */}
        {recibo && (
          <div className="flex flex-col gap-3">
            <div
              ref={reciboRef}
              className="flex flex-col rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-lg shadow-black/30 select-none"
            >
              <div className="text-center border-b border-zinc-700 pb-3 mb-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                  {recibo.tipo === "pago"
                    ? "Recibo de Pago"
                    : "Recibo de Moto Recuperada"}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">{recibo.fecha}</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Cliente</span>
                  <span className="text-zinc-100 font-medium text-right max-w-[60%]">
                    {recibo.cliente}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Recuperador</span>
                  <span className="text-zinc-100 font-medium text-right max-w-[60%]">
                    {etiquetaRecuperador(recibo.recuperador)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Cédula</span>
                  <span className="text-zinc-100 font-medium">
                    {recibo.cedula}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Placa</span>
                  <span className="text-zinc-100 font-medium tracking-widest">
                    {recibo.placa}
                  </span>
                </div>
              </div>

              {recibo.tipo === "pago" && (
                <div className="border-t border-zinc-700 my-3 pt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Método</span>
                    <span className="text-zinc-100 font-medium">
                      {recibo.tipoPago ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Modalidad</span>
                    <span className="text-zinc-100 font-medium">
                      {recibo.presencial ? "Presencial" : "Remoto"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Abono</span>
                    <span className="text-zinc-100 font-medium tabular-nums">
                      {formatearCOP(String(recibo.montoPago))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Multa</span>
                    <span className="text-amber-400 font-medium tabular-nums">
                      {formatearCOP(String(recibo.montoMulta))}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-700 pt-2">
                    <span className="text-zinc-300 font-semibold">Neto abonado</span>
                    <span className="text-emerald-400 font-bold text-base tabular-nums">
                      {formatearCOP(String(recibo.total))}
                    </span>
                  </div>
                  {(recibo.fotoLocal ?? recibo.fotoUrl) ? (
                    <div className="pt-2">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 text-center">
                        Comprobante presencial
                      </p>
                      <FotoComprobante
                        placa={recibo.placa}
                        fotoLocal={recibo.fotoLocal}
                        fotoRemota={recibo.fotoUrl}
                        className="w-full rounded-xl border border-zinc-700 object-cover max-h-48 bg-zinc-800"
                        alt="Foto del pago presencial"
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {recibo.gpsUbicacion ? (
                <p className="text-[10px] text-zinc-500 text-center mt-2 tabular-nums">
                  GPS: {recibo.gpsUbicacion}
                </p>
              ) : null}

              <div className="border-t border-zinc-700 pt-3 mt-1 text-center">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Referencia
                </p>
                <p className="text-lg font-bold tracking-[0.15em] text-white">
                  {recibo.referencia}
                </p>
              </div>
            </div>

            {/* Botones del recibo */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void compartirReciboWpp()}
                disabled={exportandoRecibo}
                className="flex-1 min-h-[50px] rounded-xl bg-[#25D366] text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform touch-manipulation shadow-md shadow-[#25D366]/20 flex items-center justify-center gap-2"
              >
                <svg
                  aria-hidden
                  className="w-5 h-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {exportandoRecibo ? "Generando…" : "Compartir"}
              </button>
              <button
                type="button"
                onClick={() => void descargarRecibo()}
                disabled={exportandoRecibo}
                className="flex-1 min-h-[50px] rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-100 font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform touch-manipulation flex items-center justify-center gap-2"
              >
                <svg
                  aria-hidden
                  className="w-5 h-5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Descargar
              </button>
            </div>
          </div>
        )}

        {/* Wizard procedural: generar pago */}
        {pagoPaso && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="w-full max-w-[400px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
              <p className="text-[11px] text-emerald-400 font-medium mb-1">
                Paso {indicePasoPago} de {totalPasosPago}
              </p>

              {pagoPaso === "montos" && (
                <>
                  <h2 className="text-base font-semibold text-white mb-1">
                    ¿Cuánto pagó el cliente?
                  </h2>
                  <p className="text-xs text-zinc-500 mb-4">
                    Escribe el abono y la multa si aplica.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-zinc-400 pl-0.5 block mb-1">
                        Valor del abono ($)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatearConPuntos(montoPago)}
                        onChange={(e) =>
                          setMontoPago(limpiarNumero(e.target.value))
                        }
                        className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 pl-0.5 block mb-1">
                        Valor de la multa ($)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={formatearConPuntos(montoMulta)}
                        onChange={(e) =>
                          setMontoMulta(limpiarNumero(e.target.value))
                        }
                        className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button
                      type="button"
                      onClick={cerrarWizardPago}
                      className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm touch-manipulation"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => setPagoPaso("metodo")}
                      disabled={!limpiarNumero(montoPago)}
                      className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
                    >
                      Siguiente
                    </button>
                  </div>
                </>
              )}

              {pagoPaso === "metodo" && (
                <>
                  <h2 className="text-base font-semibold text-white mb-1">
                    ¿Cómo pagó?
                  </h2>
                  <p className="text-xs text-zinc-500 mb-4">
                    Elige una opción.
                  </p>
                  <div className="flex flex-col gap-2">
                    {METODOS_PAGO.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMetodoPago(m)}
                        className={`min-h-[52px] rounded-xl border text-base font-semibold touch-manipulation ${
                          metodoPago === m
                            ? "border-emerald-500 bg-emerald-950/50 text-emerald-200"
                            : "border-zinc-600 bg-zinc-800 text-white"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button
                      type="button"
                      onClick={() => setPagoPaso("montos")}
                      className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm touch-manipulation"
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      onClick={() => void avanzarAModalidad()}
                      disabled={!metodoPago || solicitandoGps}
                      className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
                    >
                      {solicitandoGps ? "GPS…" : "Siguiente"}
                    </button>
                  </div>
                </>
              )}

              {pagoPaso === "modalidad" && (
                <>
                  <h2 className="text-base font-semibold text-white mb-1">
                    ¿El pago fue en persona?
                  </h2>
                  <p className="text-xs text-zinc-500 mb-4">
                    Presencial = estás con el cliente. Remoto = transferencia o
                    Nequi sin estar juntos.
                  </p>
                  {metodoPago === "Efectivo" && gpsCapturado ? (
                    <p className="text-xs text-emerald-400 mb-3 tabular-nums">
                      ✓ Ubicación GPS: {gpsCapturado}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void elegirPresencial()}
                      disabled={solicitandoGps || guardandoPago}
                      className={`min-h-[52px] rounded-xl border text-base font-semibold touch-manipulation disabled:opacity-60 ${
                        esPresencial === true
                          ? "border-emerald-500 bg-emerald-950/50 text-emerald-200"
                          : "border-zinc-600 bg-zinc-800 text-white"
                      }`}
                    >
                      {solicitandoGps
                        ? "Activando GPS…"
                        : "Sí, presencial"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEsPresencial(false);
                        void generarRecibo();
                      }}
                      disabled={
                        guardandoPago ||
                        (metodoPago === "Efectivo" && !gpsCapturado)
                      }
                      className="min-h-[52px] rounded-xl border border-zinc-600 bg-zinc-800 text-base font-semibold text-white disabled:opacity-50 touch-manipulation"
                    >
                      No, remoto
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPagoPaso("metodo")}
                    className="w-full mt-4 min-h-[44px] rounded-xl border border-zinc-700 text-zinc-400 text-sm touch-manipulation"
                  >
                    Atrás
                  </button>
                </>
              )}

              {pagoPaso === "foto" && (
                <>
                  <h2 className="text-base font-semibold text-white mb-1">
                    Toma una foto del pago
                  </h2>
                  <p className="text-xs text-zinc-500 mb-4">
                    Fotografía el comprobante o al cliente entregando el dinero.
                  </p>
                  {gpsCapturado ? (
                    <p className="text-xs text-emerald-400 mb-3 tabular-nums">
                      ✓ Ubicación GPS guardada: {gpsCapturado}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void capturarGps()}
                      disabled={solicitandoGps}
                      className="w-full mb-3 min-h-[44px] rounded-xl border border-amber-700/60 bg-amber-950/30 text-amber-200 text-sm font-medium touch-manipulation"
                    >
                      {solicitandoGps
                        ? "Obteniendo GPS…"
                        : "Activar ubicación GPS"}
                    </button>
                  )}
                  <input
                    ref={inputFotoRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={onSeleccionarFoto}
                  />
                  {procesandoFoto ? (
                    <p className="w-full min-h-[120px] flex items-center justify-center text-sm text-zinc-400 mb-3">
                      Comprimiendo foto…
                    </p>
                  ) : fotoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fotoPreview}
                      alt="Vista previa"
                      className="w-full rounded-xl border border-zinc-600 object-cover max-h-52 mb-3"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => inputFotoRef.current?.click()}
                      disabled={procesandoFoto}
                      className="w-full min-h-[120px] rounded-xl border-2 border-dashed border-zinc-600 bg-zinc-800/50 text-zinc-300 text-sm font-medium touch-manipulation disabled:opacity-50"
                    >
                      Tocar para abrir cámara
                    </button>
                  )}
                  {fotoPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setFotoPreview(null);
                        setFotoFile(null);
                        if (inputFotoRef.current) inputFotoRef.current.value = "";
                      }}
                      className="w-full mt-2 text-xs text-zinc-500 underline"
                    >
                      Tomar otra foto
                    </button>
                  )}
                  <div className="flex gap-2 mt-5">
                    <button
                      type="button"
                      onClick={() => setPagoPaso("modalidad")}
                      disabled={guardandoPago}
                      className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm touch-manipulation"
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      onClick={() => void generarRecibo()}
                      disabled={
                        !fotoFile || guardandoPago || !gpsCapturado || procesandoFoto
                      }
                      className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
                    >
                      {guardandoPago ? "Guardando…" : "Generar recibo"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Paso 1: confirmar moto recuperada */}
        {pasoRecuperada === "confirmar" && v && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="w-full max-w-[400px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
              <p className="text-[11px] text-blue-400 font-medium mb-1">
                Paso 1 de 2
              </p>
              <h2 className="text-base font-semibold text-white mb-2">
                ¿Recuperaste la moto?
              </h2>
              <p className="text-sm text-zinc-400 mb-1">
                Placa{" "}
                <span className="text-white font-bold tracking-widest">
                  {(v.placa || "").toUpperCase().replace(/\s/g, "")}
                </span>
              </p>
              <p className="text-sm text-zinc-500 mb-5">
                Recuperador: {etiquetaRecuperador(recuperadorRecibo)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPasoRecuperada(null)}
                  className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm touch-manipulation"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void generarReciboRecuperada()}
                  disabled={solicitandoGps}
                  className="flex-1 min-h-[48px] rounded-xl bg-blue-700 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
                >
                  {solicitandoGps ? "Obteniendo GPS…" : "Sí, continuar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <NavFooter />
    </div>
  );
}
