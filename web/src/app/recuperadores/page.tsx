"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";

import { NavFooter } from "@/components/NavFooter";

type Asignacion = {
  id: number;
  placa: string;
  estado: string;
  pagado: number;
  multa: number;
  fecha_asignada: string | null;
  fecha_recuperada: string | null;
};

type Recuperador = {
  nombre: string;
  asignaciones: Asignacion[];
};

type Vehiculo = Record<string, string>;

type TipoRecibo = "pago" | "recuperada";

function formatearCOP(val: string | number | undefined): string {
  if (val == null || val === "") return "—";
  const n = typeof val === "string" ? Number(val.replace(/,/g, "")) : Number(val);
  if (Number.isNaN(n)) return String(val);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatFechaCorta(iso: string | undefined | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!d) return iso;
  return `${d}/${m}/${y?.slice(2) ?? y}`;
}

const RECUPERADORES_FIJOS = [
  "John Sáenz",
  "Diego Rodríguez",
  "Moisés Ojeda",
  "David Berastegui",
  "Jean Pier Mindiola",
  "Josué Mindiola",
  "Fabián Garzón",
  "Nicolás Garrido",
];

export default function RecuperadoresPage() {
  const [recuperadores, setRecuperadores] = useState<Recuperador[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedPlaca, setSelectedPlaca] = useState<string | null>(null);
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [loadingVehiculo, setLoadingVehiculo] = useState(false);

  const [showPagoForm, setShowPagoForm] = useState(false);
  const [montoPago, setMontoPago] = useState("");
  const [montoMulta, setMontoMulta] = useState("");
  const [tipoRecibo, setTipoRecibo] = useState<TipoRecibo>("pago");
  const [recibo, setRecibo] = useState<{
    referencia: string;
    fecha: string;
    cliente: string;
    cedula: string;
    placa: string;
    montoPago: number;
    montoMulta: number;
    total: number;
    tipo: TipoRecibo;
  } | null>(null);

  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const reciboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/recuperadores")
      .then((r) => r.json())
      .then((data) => {
        if (data.recuperadores) {
          setRecuperadores(data.recuperadores);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const asignacionesActuales = useMemo(
    () =>
      selectedName
        ? recuperadores.find((r) => r.nombre === selectedName)?.asignaciones ||
          []
        : [],
    [selectedName, recuperadores],
  );

  const placaReciboYaRecuperada = useMemo(() => {
    if (!recibo) return false;
    const asig = asignacionesActuales.find((a) => a.placa === recibo.placa);
    return asig?.estado === "recuperada";
  }, [recibo, asignacionesActuales]);

  const consultarPlaca = useCallback(async (placa: string) => {
    setLoadingVehiculo(true);
    setVehiculo(null);
    setRecibo(null);
    try {
      const res = await fetch(`/api/placa?placa=${encodeURIComponent(placa)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setVehiculo(data.vehiculo as Vehiculo);
      }
    } catch {
      // ignore
    } finally {
      setLoadingVehiculo(false);
    }
  }, []);

  const abrirFormularioPago = useCallback(
    (placa: string) => {
      setSelectedPlaca(placa);
      setTipoRecibo("pago");
      setMontoPago("");
      setMontoMulta("");
      setShowPagoForm(true);
    },
    [],
  );

  const generarReciboRecuperada = useCallback(
    async (placa: string) => {
      setSelectedPlaca(placa);
      setTipoRecibo("recuperada");
      setRecibo(null);
      setVehiculo(null);

      try {
        const res = await fetch(`/api/placa?placa=${encodeURIComponent(placa)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        const v = res.ok ? (data.vehiculo as Vehiculo) : null;

        const now = new Date();
        const dd = String(now.getDate()).padStart(2, "0");
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const yy = String(now.getFullYear()).slice(-2);
        const rand = String(Math.floor(10000 + Math.random() * 90000));
        const referencia = `${dd}${mm}${yy}${rand}`;

        setRecibo({
          referencia,
          fecha: `${dd}/${mm}/${String(now.getFullYear())}`,
          cliente: v?.nombre || "—",
          cedula: v?.cedula || "—",
          placa: placa.toUpperCase().replace(/\s/g, ""),
          montoPago: 0,
          montoMulta: 0,
          total: 0,
          tipo: "recuperada",
        });
      } catch {
        // ignore
      }
    },
    [],
  );

  const generarRecibo = useCallback(async () => {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const rand = String(Math.floor(10000 + Math.random() * 90000));
    const referencia = `${dd}${mm}${yy}${rand}`;

    const pago = parseFloat(montoPago) || 0;
    const multa = parseFloat(montoMulta) || 0;
    const placaNorm = (selectedPlaca || "").toUpperCase().replace(/\s/g, "");

    setRecibo({
      referencia,
      fecha: `${dd}/${mm}/${String(now.getFullYear())}`,
      cliente: vehiculo?.nombre || "—",
      cedula: vehiculo?.cedula || "—",
      placa: placaNorm,
      montoPago: pago,
      montoMulta: multa,
      total: pago - multa,
      tipo: tipoRecibo,
    });
    setShowPagoForm(false);

    const asignacion = asignacionesActuales.find((a) => a.placa === placaNorm);
    if (!asignacion) return;

    try {
      const res = await fetch("/api/recuperadores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: asignacion.id,
          estado_moto: "Abonó",
          pagado: pago,
          multa: multa,
        }),
      });
      if (res.ok) {
        setMensajeExito(`Placa ${placaNorm} registrada como Abonó`);
        setRecuperadores((prev) =>
          prev.map((r) => {
            if (r.nombre !== selectedName) return r;
            return {
              ...r,
              asignaciones: r.asignaciones.map((a) =>
                a.id === asignacion.id
                  ? { ...a, estado: "Abonó", pagado: pago, multa: multa }
                  : a,
              ),
            };
          }),
        );
      }
    } catch {
      // ignore
    }
  }, [
    montoPago,
    montoMulta,
    vehiculo,
    selectedPlaca,
    tipoRecibo,
    asignacionesActuales,
    selectedName,
  ]);

  const marcarRecuperada = useCallback(async () => {
    if (!selectedPlaca || !recibo) return;

    const asignacion = asignacionesActuales.find(
      (a) => a.placa === recibo.placa,
    );
    if (!asignacion) return;

    try {
      const res = await fetch("/api/recuperadores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: asignacion.id,
          estado_moto: "recuperada",
          pagado: asignacion.pagado,
          multa: asignacion.multa,
        }),
      });
      if (res.ok) {
        setMensajeExito(
          `Moto ${recibo.placa} marcada como recuperada`,
        );
        setRecuperadores((prev) =>
          prev.map((r) => {
            if (r.nombre !== selectedName) return r;
            return {
              ...r,
              asignaciones: r.asignaciones.map((a) =>
                a.id === asignacion.id
                  ? {
                      ...a,
                      estado: "recuperada",
                      fecha_recuperada: new Date().toISOString(),
                    }
                  : a,
              ),
            };
          }),
        );
      }
    } catch {
      // ignore
    }
  }, [selectedPlaca, recibo, asignacionesActuales, selectedName]);

  const compartirReciboWpp = useCallback(async () => {
    if (!recibo) return;

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
      `Fecha: ${recibo.fecha}`,
    ];

    if (recibo.tipo === "pago") {
      lineas.push(
        `─────────────────`,
        `Abono: ${formatearCOP(recibo.montoPago)}`,
        `Multa: ${formatearCOP(recibo.montoMulta)}`,
        `*Neto abonado: ${formatearCOP(recibo.total)}*`,
      );
    }

    lineas.push(
      `─────────────────`,
      `*Ref: ${recibo.referencia}*`,
      `─────────────────`,
    );

    const texto = lineas.join("\n");

    if (reciboRef.current) {
      try {
        const dataUrl = await toPng(reciboRef.current, {
          backgroundColor: "#09090b",
          pixelRatio: 2,
        });
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File(
          [blob],
          `recibo_${recibo.referencia}.png`,
          { type: "image/png" },
        );
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Recibo ${recibo.referencia}`,
            text: texto,
            files: [file],
          });
          return;
        }
      } catch {
        // fallback a texto
      }
    }

    const urlWpp = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(urlWpp, "_blank", "noopener,noreferrer");
  }, [recibo]);

  const descargarRecibo = useCallback(async () => {
    if (!reciboRef.current || !recibo) return;
    const dataUrl = await toPng(reciboRef.current, {
      backgroundColor: "#09090b",
      pixelRatio: 2,
    });
    const link = document.createElement("a");
    link.download = `recibo_${recibo.referencia}.png`;
    link.href = dataUrl;
    link.click();
  }, [recibo]);

  const nombreRecuperador = selectedName || "Selecciona tu nombre";

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="shrink-0 px-4 pb-3 border-b border-zinc-800/80">
        <h1 className="text-base font-semibold tracking-tight text-white">
          Recuperadores
        </h1>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          {nombreRecuperador}
        </p>
      </header>

      <main className="flex-1 w-full max-w-[414px] mx-auto px-3 sm:px-4 pt-3 flex flex-col gap-3 min-h-0">
        {mensajeExito && (
          <div
            role="alert"
            className="shrink-0 rounded-xl border border-emerald-900/60 bg-emerald-950/40 px-3.5 py-2.5 text-sm text-emerald-200"
          >
            {mensajeExito}
          </div>
        )}

        {/* Selector de recuperador */}
        <section className="shrink-0 flex flex-col gap-1.5">
          <label className="text-xs text-zinc-400 pl-0.5">
            ¿Quién eres?
          </label>
          <div className="flex flex-wrap gap-1.5">
            {RECUPERADORES_FIJOS.map((nom) => {
              const activo = selectedName === nom;
              const tieneAsig = recuperadores.find(
                (r) => r.nombre === nom,
              )?.asignaciones.length;
              return (
                <button
                  key={nom}
                  type="button"
                  onClick={() => {
                    setSelectedName(nom);
                    setVehiculo(null);
                    setRecibo(null);
                    setSelectedPlaca(null);
                    setMensajeExito(null);
                    if (!recuperadores.find((r) => r.nombre === nom)) {
                      setRecuperadores((prev) => [
                        ...prev,
                        { nombre: nom, asignaciones: [] },
                      ]);
                    }
                  }}
                  className={`min-h-[44px] rounded-xl px-3.5 text-sm font-medium transition-all touch-manipulation ${
                    activo
                      ? "bg-emerald-700 text-white border border-emerald-500 shadow-sm shadow-emerald-900/30"
                      : "bg-zinc-900 text-zinc-300 border border-zinc-700 active:bg-zinc-800"
                  }`}
                >
                  {nom}
                  {tieneAsig ? (
                    <span className="ml-1.5 text-[10px] opacity-60">
                      ({tieneAsig})
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        {/* Asignaciones */}
        {selectedName && (
          <>
            {loading ? (
              <p className="text-sm text-zinc-500 text-center py-4">
                Cargando...
              </p>
            ) : asignacionesActuales.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                <p className="text-sm text-zinc-500">
                  No tienes motos asignadas aún
                </p>
              </div>
            ) : (
              <section className="flex flex-col gap-2">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 pl-0.5">
                  Tus motos asignadas
                </h2>
                {asignacionesActuales.map((asig) => (
                  <article
                    key={asig.id}
                    className={`rounded-2xl border px-4 py-3 ${
                      asig.estado === "recuperada"
                        ? "border-emerald-900/60 bg-emerald-950/20"
                        : asig.estado === "Abonó"
                          ? "border-blue-900/60 bg-blue-950/20"
                          : "border-zinc-800 bg-zinc-900/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-lg font-bold tracking-[0.15em] text-white">
                          {asig.placa}
                        </span>
                        <span
                          className={`ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded-full ${
                            asig.estado === "recuperada"
                              ? "bg-emerald-900/60 text-emerald-300"
                              : asig.estado === "Abonó"
                                ? "bg-blue-900/60 text-blue-300"
                                : "bg-amber-900/60 text-amber-300"
                          }`}
                        >
                          {asig.estado}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500">
                        {formatFechaCorta(asig.fecha_asignada)}
                      </span>
                    </div>

                    {asig.estado !== "recuperada" && asig.estado !== "Abonó" && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            consultarPlaca(asig.placa);
                            abrirFormularioPago(asig.placa);
                          }}
                          className="flex-1 min-h-[42px] rounded-xl bg-emerald-700 text-white font-semibold text-xs active:scale-[0.98] transition-transform touch-manipulation"
                        >
                          Recibo de Pago
                        </button>
                        <button
                          type="button"
                          onClick={() => generarReciboRecuperada(asig.placa)}
                          className="flex-1 min-h-[42px] rounded-xl bg-blue-700 text-white font-semibold text-xs active:scale-[0.98] transition-transform touch-manipulation"
                        >
                          Moto Recuperada
                        </button>
                      </div>
                    )}

                    {asig.estado === "Abonó" && (
                      <div className="mt-2 flex gap-3 text-xs text-zinc-400">
                        <span>Abono: {formatearCOP(asig.pagado)}</span>
                        <span>Multa: {formatearCOP(asig.multa)}</span>
                      </div>
                    )}

                    {asig.estado === "recuperada" && (
                      <div className="mt-2 flex gap-3 text-xs text-zinc-400">
                        <span>Recuperada el {formatFechaCorta(asig.fecha_recuperada)}</span>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            )}
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
                    <span className="text-zinc-400">Abono</span>
                    <span className="text-zinc-100 font-medium tabular-nums">
                      {formatearCOP(recibo.montoPago)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Multa</span>
                    <span className="text-amber-400 font-medium tabular-nums">
                      {formatearCOP(recibo.montoMulta)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-700 pt-2">
                    <span className="text-zinc-300 font-semibold">
                      Neto abonado
                    </span>
                    <span className="text-emerald-400 font-bold text-base tabular-nums">
                      {formatearCOP(recibo.total)}
                    </span>
                  </div>
                </div>
              )}

              <div className="border-t border-zinc-700 pt-3 mt-1 text-center">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Referencia
                </p>
                <p className="text-lg font-bold tracking-[0.15em] text-white">
                  {recibo.referencia}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={compartirReciboWpp}
                className="flex-1 min-h-[50px] rounded-xl bg-[#25D366] text-white font-semibold text-sm active:scale-[0.98] transition-transform touch-manipulation shadow-md shadow-[#25D366]/20 flex items-center justify-center gap-2"
              >
                <svg
                  aria-hidden
                  className="w-5 h-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Compartir
              </button>
              <button
                type="button"
                onClick={descargarRecibo}
                className="flex-1 min-h-[50px] rounded-xl border border-zinc-700 bg-zinc-800/50 text-zinc-100 font-semibold text-sm active:scale-[0.98] transition-transform touch-manipulation flex items-center justify-center gap-2"
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

            {recibo.tipo === "recuperada" && !placaReciboYaRecuperada && (
              <button
                type="button"
                onClick={marcarRecuperada}
                className="w-full min-h-[50px] rounded-xl bg-blue-700 text-white font-semibold text-sm active:scale-[0.98] transition-transform touch-manipulation shadow-lg shadow-blue-900/30"
              >
                Confirmar y marcar como recuperada
              </button>
            )}
          </div>
        )}

        {/* Modal formulario de pago */}
        {showPagoForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="w-full max-w-[400px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
              <h2 className="text-base font-semibold text-white mb-1">
                Generar recibo de pago
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Placa: {selectedPlaca}
                {loadingVehiculo && " — Consultando..."}
              </p>

              {vehiculo && (
                <div className="mb-4 rounded-xl bg-zinc-800/50 px-3 py-2 text-sm">
                  <p className="text-zinc-100 font-medium">{vehiculo.nombre}</p>
                  <p className="text-zinc-400 text-xs">CC {vehiculo.cedula}</p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-400 pl-0.5 block mb-1">
                    Valor del abono ($)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 pl-0.5 block mb-1">
                    Valor de la multa ($)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={montoMulta}
                    onChange={(e) => setMontoMulta(e.target.value)}
                    className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-600"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setShowPagoForm(false);
                    setMontoPago("");
                    setMontoMulta("");
                  }}
                  className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm active:scale-[0.98] transition-transform touch-manipulation"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={generarRecibo}
                  className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold text-sm active:scale-[0.98] transition-transform touch-manipulation"
                >
                  Generar recibo
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
