"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmarRecuperadaModal } from "@/components/ConfirmarRecuperadaModal";
import { DeudaResumenSection } from "@/components/DeudaResumenSection";
import { NavFooter } from "@/components/NavFooter";
import { ReciboGeneradoPanel } from "@/components/ReciboGeneradoPanel";
import { RecuperadorFifaCard } from "@/components/RecuperadorFifaCard";
import { RecuperadoresPodio } from "@/components/RecuperadoresPodio";
import { WizardPagoModal } from "@/components/WizardPagoModal";
import { formatFechaHora } from "@/lib/fechas";
import { formatearCOP, limpiarNumero } from "@/lib/formatoDinero";
import {
  leerFotoDeCache,
  normalizarPlaca,
  prepararFotoPresencial,
} from "@/lib/fotoComprobante";
import {
  enlaceGoogleMaps,
  mensajeErrorGps,
  obtenerGpsUbicacion,
} from "@/lib/geolocation";
import {
  etiquetaRecuperador,
  RECUPERADORES,
} from "@/lib/recuperadores";
import { dineroRecuperadoAsignacionEnPeriodo } from "@/lib/metricasRecuperadores";
import type { MetodoPago, PagoPaso, ReciboData } from "@/lib/reciboTypes";
import {
  abrirWhatsAppConTexto,
  capturarReciboPng,
  compartirReciboWhatsApp,
  descargarBlob,
  dataUrlToBlob,
} from "@/lib/reciboImagen";

type Asignacion = {
  id: number;
  placa: string;
  estado: string;
  pagado: number;
  multa: number;
  gps_moto: string;
  fecha_asignada: string | null;
  fecha_recuperada: string | null;
  fecha_abono: string | null;
  foto: string | null;
  tipo_pago: string | null;
  presencial: boolean | null;
};

type Recuperador = {
  nombre: string;
  asignaciones: Asignacion[];
};

type Vehiculo = Record<string, string>;

type DeudaPlaca = {
  nombre: string;
  deuda_total: string;
  dias_mora: number;
  cuotas_pendientes?: number | null;
  telefono?: string;
};

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

function esAsignacionPendiente(estado: string): boolean {
  const e = estado.trim().toLowerCase();
  return e !== "recuperada" && e !== "abonó" && e !== "abono";
}

function actualizarAsignacion(
  recuperadores: Recuperador[],
  id: number,
  cambios: Partial<Asignacion>,
): Recuperador[] {
  return recuperadores.map((r) => ({
    ...r,
    asignaciones: r.asignaciones.map((a) =>
      a.id === id ? { ...a, ...cambios } : a,
    ),
  }));
}

function nuevaReferencia(): { referencia: string; fecha: string } {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const rand = String(Math.floor(10000 + Math.random() * 90000));
  return {
    referencia: `${dd}${mm}${yy}${rand}`,
    fecha: `${dd}/${mm}/${String(now.getFullYear())}`,
  };
}

export default function RecuperadoresPage() {
  const [recuperadores, setRecuperadores] = useState<Recuperador[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [placaActiva, setPlacaActiva] = useState<string | null>(null);
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [asignacionActiva, setAsignacionActiva] = useState<Asignacion | null>(
    null,
  );

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

  const [recuperadorRecibo, setRecuperadorRecibo] = useState("");
  const [recibo, setRecibo] = useState<ReciboData | null>(null);
  const [pasoRecuperada, setPasoRecuperada] = useState<"confirmar" | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeInfo] = useState<string | null>(null);
  const [deudasPorPlaca, setDeudasPorPlaca] = useState<
    Record<string, DeudaPlaca | null>
  >({});
  const [cargandoDeudas, setCargandoDeudas] = useState(false);
  const [exportandoRecibo, setExportandoRecibo] = useState(false);

  const reciboRef = useRef<HTMLDivElement>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const asignacionesRef = useRef<HTMLElement>(null);

  const recargarRecuperadores = useCallback(async () => {
    const res = await fetch("/api/recuperadores", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setRecuperadores(data.recuperadores ?? []);
    }
  }, []);

  useEffect(() => {
    recargarRecuperadores().finally(() => setLoading(false));
  }, [recargarRecuperadores]);

  const asignacionesActuales = useMemo(
    () =>
      selectedName
        ? recuperadores.find((r) => r.nombre === selectedName)?.asignaciones ||
          []
        : [],
    [selectedName, recuperadores],
  );

  const asignacionesPendientes = useMemo(
    () => asignacionesActuales.filter((a) => esAsignacionPendiente(a.estado)),
    [asignacionesActuales],
  );

  const top3Podio = useMemo(() => {
    const ahora = new Date();
    const ranking = RECUPERADORES.map((rec) => {
      const grupo = recuperadores.find((r) => r.nombre === rec.nombre);
      const dinero =
        grupo?.asignaciones.reduce(
          (sum, a) =>
            sum +
            dineroRecuperadoAsignacionEnPeriodo(
              {
                estado: a.estado,
                pagado: a.pagado,
                multa: a.multa,
                fecha_abono: a.fecha_abono,
                fecha_asignada: a.fecha_asignada,
                fecha_recuperada: a.fecha_recuperada,
              },
              "mes",
              ahora,
            ),
          0,
        ) ?? 0;
      return { etiqueta: rec.etiqueta, dinero };
    })
      .sort(
        (a, b) =>
          b.dinero - a.dinero ||
          a.etiqueta.localeCompare(b.etiqueta, "es"),
      )
      .filter((r) => r.dinero > 0)
      .slice(0, 3);

    return ranking.map((r, i) => ({
      puesto: (i + 1) as 1 | 2 | 3,
      nombre: r.etiqueta,
    }));
  }, [recuperadores]);

  const etiquetaMesPodio = useMemo(() => {
    const ahora = new Date();
    const mes = ahora.toLocaleDateString("es-CO", { month: "long" });
    return `Podio · ${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
  }, []);

  const placasConDeuda = useMemo(
    () =>
      [...new Set(asignacionesPendientes.map((a) => a.placa))].sort().join(","),
    [asignacionesPendientes],
  );

  const [busquedaPlaca, setBusquedaPlaca] = useState("");

  const resultadosBusquedaPlaca = useMemo(() => {
    const q = normalizarPlaca(busquedaPlaca);
    if (q.length < 2) return [];

    const vistos = new Set<string>();
    const hits: Array<{
      placa: string;
      recuperador: string;
      asignacion: Asignacion;
    }> = [];

    for (const r of recuperadores) {
      for (const a of r.asignaciones) {
        if (!a.placa.includes(q)) continue;
        const key = `${r.nombre}::${a.placa}::${a.id}`;
        if (vistos.has(key)) continue;
        vistos.add(key);
        hits.push({
          placa: a.placa,
          recuperador: r.nombre,
          asignacion: a,
        });
      }
    }

    return hits.sort((a, b) => {
      const pa = esAsignacionPendiente(a.asignacion.estado) ? 0 : 1;
      const pb = esAsignacionPendiente(b.asignacion.estado) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.placa.localeCompare(b.placa);
    });
  }, [busquedaPlaca, recuperadores]);

  useEffect(() => {
    if (!placasConDeuda) {
      setDeudasPorPlaca({});
      return;
    }

    const placas = placasConDeuda.split(",");
    let cancelled = false;
    setCargandoDeudas(true);

    Promise.all(
      placas.map(async (placa) => {
        try {
          const res = await fetch(
            `/api/placa?placa=${encodeURIComponent(placa)}`,
            { cache: "no-store" },
          );
          const data = await res.json();
          if (data.eliminada) return [placa, null, true] as const;
          if (!res.ok || !data.vehiculo) return [placa, null, false] as const;
          const v = data.vehiculo as Vehiculo;
          const cuotasRaw = v.cuotas_pendientes
            ? parseFloat(String(v.cuotas_pendientes))
            : null;
          return [
            placa,
            {
              nombre: v.nombre || "—",
              deuda_total: v.deuda_total || "0",
              dias_mora: parseInt(String(v.dias_mora ?? "0"), 10) || 0,
              cuotas_pendientes:
                cuotasRaw != null && !Number.isNaN(cuotasRaw)
                  ? cuotasRaw
                  : null,
              telefono: v.telefono || undefined,
            },
            false,
          ] as const;
        } catch {
          return [placa, null, false] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, DeudaPlaca | null> = {};
      let huboEliminadas = false;
      for (const [placa, info, eliminada] of results) {
        if (eliminada) huboEliminadas = true;
        else next[placa] = info;
      }
      setDeudasPorPlaca(next);
      setCargandoDeudas(false);
      if (huboEliminadas) recargarRecuperadores();
    });

    return () => {
      cancelled = true;
    };
  }, [placasConDeuda, recargarRecuperadores]);

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

  const limpiarFlujoActivo = useCallback(() => {
    setPlacaActiva(null);
    setVehiculo(null);
    setAsignacionActiva(null);
    cerrarWizardPago();
    setPasoRecuperada(null);
  }, [cerrarWizardPago]);

  const seleccionarRecuperador = useCallback(
    (nombre: string) => {
      setSelectedName(nombre);
      setRecuperadorRecibo(nombre);
      limpiarFlujoActivo();
      setRecibo(null);
      setMensajeInfo(null);
      setError(null);
      if (!recuperadores.find((r) => r.nombre === nombre)) {
        setRecuperadores((prev) => [...prev, { nombre, asignaciones: [] }]);
      }
    },
    [recuperadores, limpiarFlujoActivo],
  );

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

  const cargarVehiculo = useCallback(async (placa: string) => {
    const res = await fetch(`/api/placa?placa=${encodeURIComponent(placa)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "No se encontró la placa");
    }
    return data.vehiculo as Vehiculo;
  }, []);

  const onSeleccionarFoto = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const placa = placaActiva || vehiculo?.placa;
      if (!file || !placa) return;
      setProcesandoFoto(true);
      setError(null);
      try {
        const placaNorm = normalizarPlaca(placa);
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
    [placaActiva, vehiculo?.placa],
  );

  const iniciarPago = useCallback(
    async (asig: Asignacion) => {
      if (!selectedName) {
        setError("Selecciona tu nombre en el equipo de rescate");
        return;
      }
      setError(null);
      setMensajeInfo(null);
      setRecibo(null);
      setPasoRecuperada(null);
      cerrarWizardPago();
      setPlacaActiva(asig.placa);
      setAsignacionActiva(asig);
      setRecuperadorRecibo(selectedName);

      try {
        const v = await cargarVehiculo(asig.placa);
        setVehiculo(v);
        setPagoPaso("montos");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "No se pudo cargar datos de la placa",
        );
        limpiarFlujoActivo();
      }
    },
    [selectedName, cargarVehiculo, cerrarWizardPago, limpiarFlujoActivo],
  );

  const iniciarRecuperada = useCallback(
    async (asig: Asignacion) => {
      if (!selectedName) {
        setError("Selecciona tu nombre en el equipo de rescate");
        return;
      }
      setError(null);
      setMensajeInfo(null);
      setRecibo(null);
      cerrarWizardPago();
      setPlacaActiva(asig.placa);
      setAsignacionActiva(asig);
      setRecuperadorRecibo(selectedName);

      try {
        const v = await cargarVehiculo(asig.placa);
        setVehiculo(v);
        setPasoRecuperada("confirmar");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "No se pudo cargar datos de la placa",
        );
        limpiarFlujoActivo();
      }
    },
    [selectedName, cargarVehiculo, cerrarWizardPago, limpiarFlujoActivo],
  );

  const generarRecibo = useCallback(async () => {
    if (
      !vehiculo ||
      !recuperadorRecibo ||
      !metodoPago ||
      esPresencial == null ||
      !asignacionActiva
    ) {
      return;
    }
    if (esPresencial && !fotoFile) {
      setError("Toma la foto del pago presencial");
      return;
    }

    const placaNorm = normalizarPlaca(placaActiva || vehiculo.placa || "");
    setGuardandoPago(true);
    setError(null);

    try {
      const subirFoto =
        esPresencial && fotoFile
          ? (async () => {
              const fd = new FormData();
              fd.append("file", fotoFile);
              fd.append("placa", placaNorm);
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

      const [fotoUrl] = await Promise.all([subirFoto]);
      const gpsUbicacion = gpsCapturado;
      const { referencia, fecha } = nuevaReferencia();
      const pago = Number(limpiarNumero(montoPago)) || 0;
      const multa = Number(limpiarNumero(montoMulta)) || 0;

      const fotoLocal = esPresencial
        ? ((await leerFotoDeCache(placaNorm)) ?? fotoPreview ?? undefined)
        : undefined;

      setRecibo({
        referencia,
        fecha,
        recuperador: recuperadorRecibo,
        cliente: vehiculo.nombre || "—",
        cedula: vehiculo.cedula || "—",
        placa: placaNorm,
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

      setRecuperadores((prev) =>
        actualizarAsignacion(prev, asignacionActiva.id, {
          estado: "Abonó",
          pagado: pago,
          multa,
          tipo_pago: metodoPago,
          presencial: esPresencial,
          foto: fotoUrl ?? null,
        }),
      );
      setMensajeInfo(`Placa ${placaNorm} registrada como Abonó`);
      asignacionesRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      const res = await fetch("/api/recuperadores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: asignacionActiva.id,
          estado_moto: "Abonó",
          pagado: pago,
          multa,
          nombre_recuperador: recuperadorRecibo,
          tipo_pago: metodoPago,
          presencial: esPresencial,
          foto: fotoUrl ?? null,
          gps_ubicacion: gpsUbicacion,
        }),
      });
      if (!res.ok) {
        await recargarRecuperadores();
        setMensajeInfo(null);
        setError("No se pudo guardar el abono en el servidor");
      } else {
        await recargarRecuperadores();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sin conexión al guardar el pago",
      );
    } finally {
      setGuardandoPago(false);
    }
  }, [
    vehiculo,
    recuperadorRecibo,
    metodoPago,
    esPresencial,
    fotoFile,
    fotoPreview,
    gpsCapturado,
    requiereGpsPago,
    montoPago,
    montoMulta,
    placaActiva,
    asignacionActiva,
    cerrarWizardPago,
    recargarRecuperadores,
  ]);

  const generarReciboRecuperada = useCallback(async () => {
    if (!vehiculo || !recuperadorRecibo || !asignacionActiva) return;
    setError(null);
    setMensajeInfo(null);
    setSolicitandoGps(true);
    const gpsResult = await obtenerGpsUbicacion();
    setSolicitandoGps(false);
    if (!gpsResult.ok) {
      setError(mensajeErrorGps(gpsResult.motivo));
      return;
    }

    const placaNorm = normalizarPlaca(placaActiva || vehiculo.placa || "");
    const { referencia, fecha } = nuevaReferencia();
    const gpsUbicacion = gpsResult.coords;
    const fechaRecuperada = new Date().toISOString();

    setRecuperadores((prev) =>
      actualizarAsignacion(prev, asignacionActiva.id, {
        estado: "recuperada",
        fecha_recuperada: fechaRecuperada,
      }),
    );

    try {
      const res = await fetch("/api/recuperadores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: asignacionActiva.id,
          estado_moto: "recuperada",
          pagado: asignacionActiva.pagado,
          multa: asignacionActiva.multa,
          nombre_recuperador: recuperadorRecibo,
          gps_ubicacion: gpsUbicacion,
        }),
      });
      if (!res.ok) {
        const dataErr = await res.json().catch(() => ({}));
        await recargarRecuperadores();
        setError(
          (dataErr as { error?: string }).error ??
            "No se pudo marcar la moto como recuperada",
        );
        return;
      }

      setRecibo({
        referencia,
        fecha,
        recuperador: recuperadorRecibo,
        cliente: vehiculo.nombre || "—",
        cedula: vehiculo.cedula || "—",
        placa: placaNorm,
        montoPago: 0,
        montoMulta: 0,
        total: 0,
        tipo: "recuperada",
        gpsUbicacion,
      });
      setPasoRecuperada(null);
      setMensajeInfo(`Moto ${placaNorm} marcada como recuperada`);
      asignacionesRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      await recargarRecuperadores();
    } catch {
      setError("Sin conexión para guardar la recuperación");
      await recargarRecuperadores();
    }
  }, [
    vehiculo,
    recuperadorRecibo,
    placaActiva,
    asignacionActiva,
    recargarRecuperadores,
  ]);

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
      `Recuperador: ${etiquetaRecuperador(recibo.recuperador)}`,
      `Fecha: ${recibo.fecha}`,
    ];

    if (recibo.tipo === "pago") {
      lineas.push(
        `─────────────────`,
        `Método: ${recibo.tipoPago ?? "—"}`,
        `Pago: ${recibo.presencial ? "Presencial" : "Remoto"}`,
        `Abono: ${formatearCOP(recibo.montoPago)}`,
        `Multa: ${formatearCOP(recibo.montoMulta)}`,
        `*Neto abonado: ${formatearCOP(recibo.total)}*`,
      );
    }

    if (recibo.gpsUbicacion) {
      lineas.push(`Ubicación: ${enlaceGoogleMaps(recibo.gpsUbicacion)}`);
    }

    lineas.push(
      `─────────────────`,
      `*Ref: ${recibo.referencia}*`,
      `─────────────────`,
    );

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

  const nombreRecuperador = selectedName
    ? etiquetaRecuperador(selectedName)
    : "Selecciona tu nombre";

  const placaConfirmar =
    placaActiva ||
    (vehiculo?.placa ? normalizarPlaca(vehiculo.placa) : "");

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="shrink-0 px-4 pb-3 border-b border-zinc-800/80">
        <h1 className="text-base font-semibold tracking-tight text-white">
          Recuperadores
        </h1>
        <p className="text-[11px] text-zinc-500 mt-0.5">{nombreRecuperador}</p>
      </header>

      <main className="flex-1 w-full max-w-[414px] mx-auto px-3 sm:px-4 pt-3 flex flex-col gap-3 min-h-0">
        {error && (
          <div
            role="alert"
            className="shrink-0 rounded-xl border border-red-900/60 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {mensajeExito && (
          <div
            role="status"
            className="shrink-0 rounded-xl border border-emerald-900/60 bg-emerald-950/40 px-3.5 py-2.5 text-sm text-emerald-200"
          >
            {mensajeExito}
          </div>
        )}

        <section className="shrink-0 flex flex-col gap-2">
          <label
            htmlFor="buscar-placa-recup"
            className="text-xs text-zinc-400 pl-0.5"
          >
            Buscar placa
          </label>
          <input
            id="buscar-placa-recup"
            type="search"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Ej. DUJ46I — ¿quién la tiene?"
            value={busquedaPlaca}
            onChange={(e) => setBusquedaPlaca(e.target.value.toUpperCase())}
            className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600/40"
          />
          {normalizarPlaca(busquedaPlaca).length >= 2 ? (
            <div className="flex flex-col gap-1.5">
              {loading ? (
                <p className="text-xs text-zinc-500 px-0.5">Buscando…</p>
              ) : resultadosBusquedaPlaca.length === 0 ? (
                <p className="text-xs text-zinc-500 px-0.5 leading-snug">
                  No hay asignación con esa placa en el equipo.
                </p>
              ) : (
                resultadosBusquedaPlaca.map((hit) => {
                  const pendiente = esAsignacionPendiente(hit.asignacion.estado);
                  return (
                    <button
                      key={`${hit.recuperador}-${hit.asignacion.id}`}
                      type="button"
                      onClick={() => {
                        seleccionarRecuperador(hit.recuperador);
                        requestAnimationFrame(() => {
                          asignacionesRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        });
                      }}
                      className="w-full text-left rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-3.5 py-2.5 active:scale-[0.99] transition-transform touch-manipulation hover:border-sky-700/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-bold tracking-[0.12em] text-white">
                          {hit.placa}
                        </span>
                        <span
                          className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                            pendiente
                              ? "bg-amber-900/60 text-amber-300"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {hit.asignacion.estado}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-sky-200/90">
                        {etiquetaRecuperador(hit.recuperador)}
                        <span className="text-zinc-500 font-normal">
                          {" "}
                          · {hit.recuperador}
                        </span>
                      </p>
                      {hit.asignacion.fecha_asignada ? (
                        <p className="mt-0.5 text-[10px] text-zinc-500 tabular-nums">
                          Asignada {formatFechaHora(hit.asignacion.fecha_asignada)}
                        </p>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </section>

        <section className="shrink-0 flex flex-col gap-1.5">
          <label className="text-xs text-zinc-400 pl-0.5">
            Equipo de rescate
          </label>
          <div className="grid grid-cols-4 gap-2 items-start">
            {RECUPERADORES.map((rec) => {
              const activo = selectedName === rec.nombre;
              const pendientes =
                recuperadores
                  .find((r) => r.nombre === rec.nombre)
                  ?.asignaciones.filter((a) => esAsignacionPendiente(a.estado))
                  .length ?? 0;
              return (
                <RecuperadorFifaCard
                  key={rec.nombre}
                  etiqueta={rec.etiqueta}
                  foto={rec.foto}
                  pendientes={pendientes}
                  activo={activo}
                  onClick={() => seleccionarRecuperador(rec.nombre)}
                />
              );
            })}
          </div>
        </section>

        <section className="shrink-0 flex flex-col gap-1.5">
          <label className="text-xs text-zinc-400 pl-0.5">{etiquetaMesPodio}</label>
          <RecuperadoresPodio top3={top3Podio} />
        </section>

        {selectedName && (
          <>
            {loading ? (
              <p className="text-sm text-zinc-500 text-center py-4">
                Cargando...
              </p>
            ) : asignacionesPendientes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                <p className="text-sm text-zinc-500">
                  No tienes motos pendientes
                </p>
              </div>
            ) : (
              <section ref={asignacionesRef} className="flex flex-col gap-2">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 pl-0.5">
                  Motos pendientes
                </h2>
                {asignacionesPendientes.map((asig) => {
                  const deuda = deudasPorPlaca[asig.placa];
                  return (
                  <article
                    key={asig.id}
                    className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-lg shadow-black/30"
                  >
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-zinc-900 border-b border-zinc-800">
                      <div className="min-w-0">
                        <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 block">
                          Moto
                        </span>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-xl font-bold tracking-[0.15em] text-white">
                            {asig.placa}
                          </span>
                          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-amber-900/60 text-amber-300">
                            {asig.estado}
                          </span>
                          {asig.gps_moto && (
                            <span className="text-[10px] uppercase px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                              GPS: {asig.gps_moto}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-zinc-500 tabular-nums text-right shrink-0">
                        {formatFechaHora(asig.fecha_asignada)}
                      </span>
                    </div>

                    <DeudaResumenSection
                      deudaTotal={deuda?.deuda_total}
                      diasMora={deuda?.dias_mora ?? 0}
                      cuotasPendientes={deuda?.cuotas_pendientes}
                      loading={cargandoDeudas && !deuda}
                      sinDatos={!cargandoDeudas && !deuda}
                    />

                    {deuda?.nombre ? (
                      <section className="px-4 py-3 border-b border-zinc-800">
                        <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1">
                          Cliente
                        </h2>
                        <p className="text-base font-semibold text-zinc-50 leading-snug break-words">
                          {deuda.nombre}
                        </p>
                      </section>
                    ) : null}

                    <div className="px-4 py-3 flex flex-col gap-2.5">
                    {(() => {
                      const wa = enlaceWhatsApp(
                        deudasPorPlaca[asig.placa]?.telefono,
                      );
                      if (!wa) return null;
                      return (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 flex w-full items-center justify-center gap-1.5 min-h-[42px] rounded-xl bg-[#25D366] text-xs font-semibold text-white active:scale-[0.98] transition-transform touch-manipulation"
                        >
                          <svg
                            aria-hidden
                            className="w-4 h-4 shrink-0"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                          </svg>
                          WhatsApp
                        </a>
                      );
                    })()}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void iniciarPago(asig)}
                        className="flex-1 min-h-[42px] rounded-xl bg-emerald-700 text-white font-semibold text-xs active:scale-[0.98] transition-transform touch-manipulation"
                      >
                        Recibo de Pago
                      </button>
                      <button
                        type="button"
                        onClick={() => void iniciarRecuperada(asig)}
                        className="flex-1 min-h-[42px] rounded-xl bg-blue-700 text-white font-semibold text-xs active:scale-[0.98] transition-transform touch-manipulation"
                      >
                        Moto Recuperada
                      </button>
                    </div>
                    </div>
                  </article>
                  );
                })}
              </section>
            )}
          </>
        )}

        {recibo && (
          <ReciboGeneradoPanel
            recibo={recibo}
            reciboRef={reciboRef}
            exportandoRecibo={exportandoRecibo}
            onCompartir={() => void compartirReciboWpp()}
            onDescargar={() => void descargarRecibo()}
          />
        )}

        {pagoPaso && (
          <WizardPagoModal
            pagoPaso={pagoPaso}
            esPresencial={esPresencial}
            montoPago={montoPago}
            montoMulta={montoMulta}
            metodoPago={metodoPago}
            fotoPreview={fotoPreview}
            fotoFile={fotoFile}
            procesandoFoto={procesandoFoto}
            gpsCapturado={gpsCapturado}
            solicitandoGps={solicitandoGps}
            guardandoPago={guardandoPago}
            inputFotoRef={inputFotoRef}
            onMontoPagoChange={setMontoPago}
            onMontoMultaChange={setMontoMulta}
            onMetodoPagoChange={setMetodoPago}
            onSeleccionarFoto={onSeleccionarFoto}
            onCerrar={() => {
              cerrarWizardPago();
              limpiarFlujoActivo();
            }}
            onPasoChange={setPagoPaso}
            onAvanzarModalidad={() => void avanzarAModalidad()}
            onElegirPresencial={() => void elegirPresencial()}
            onGenerarRemoto={() => {
              setEsPresencial(false);
              void generarRecibo();
            }}
            onCapturarGps={() => void capturarGps()}
            onGenerarRecibo={() => void generarRecibo()}
            onLimpiarFoto={() => {
              setFotoPreview(null);
              setFotoFile(null);
              if (inputFotoRef.current) inputFotoRef.current.value = "";
            }}
          />
        )}

        {pasoRecuperada === "confirmar" && placaConfirmar && (
          <ConfirmarRecuperadaModal
            placa={placaConfirmar}
            recuperador={recuperadorRecibo}
            solicitandoGps={solicitandoGps}
            onCancelar={() => {
              setPasoRecuperada(null);
              limpiarFlujoActivo();
            }}
            onContinuar={() => void generarReciboRecuperada()}
          />
        )}
      </main>
      <NavFooter />
    </div>
  );
}
