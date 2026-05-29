"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DetalleAsignacion } from "@/components/DetalleAsignacion";
import { NavFooter } from "@/components/NavFooter";
import { formatFechaHora } from "@/lib/fechas";

type PlacaDelDia = {
  id: number;
  placa: string;
  status: string;
  fecha: string;
  gps_moto: string | null;
};

type RecuperadorGroup = {
  nombre: string;
  asignaciones: Array<{
    id: number;
    placa: string;
    estado: string;
    pagado: number;
    multa: number;
    fecha_asignada: string | null;
    fecha_recuperada: string | null;
    foto: string | null;
    tipo_pago: string | null;
    presencial: boolean | null;
  }>;
};

type Metricas = {
  nombre: string;
  total_asignadas: number;
  abonadas: number;
  recuperadas: number;
  total_pagado: number;
  total_multa: number;
};

type DeudaPlaca = {
  nombre: string;
  deuda_total: string;
  dias_mora: number;
};

type PeriodoMetrica = "hoy" | "semana" | "mes" | "año";

const PERIODOS_METRICA: { key: PeriodoMetrica; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "año", label: "Año" },
];

function parseFecha(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inicioPeriodo(periodo: PeriodoMetrica, ahora = new Date()): Date {
  const inicio = new Date(ahora);
  inicio.setHours(0, 0, 0, 0);
  if (periodo === "semana") {
    const dia = inicio.getDay();
    const desdeLunes = dia === 0 ? 6 : dia - 1;
    inicio.setDate(inicio.getDate() - desdeLunes);
  } else if (periodo === "mes") {
    inicio.setDate(1);
  } else if (periodo === "año") {
    inicio.setMonth(0, 1);
  }
  return inicio;
}

function finPeriodo(ahora = new Date()): Date {
  const fin = new Date(ahora);
  fin.setHours(23, 59, 59, 999);
  return fin;
}

function enPeriodo(
  fechaIso: string | null | undefined,
  periodo: PeriodoMetrica,
  ahora = new Date(),
): boolean {
  const fecha = parseFecha(fechaIso);
  if (!fecha) return false;
  return fecha >= inicioPeriodo(periodo, ahora) && fecha <= finPeriodo(ahora);
}

function filtrarGruposPorPeriodo(
  grupos: RecuperadorGroup[],
  periodo: PeriodoMetrica,
): RecuperadorGroup[] {
  return grupos.map((g) => ({
    ...g,
    asignaciones: g.asignaciones.filter((a) =>
      enPeriodo(a.fecha_asignada, periodo),
    ),
  }));
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
  "Everth baptista",
];

const OPCIONES_GPS_MOTO = ["iop gps", "system track"] as const;

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

function calcularMetricas(grupos: RecuperadorGroup[]): Metricas[] {
  return RECUPERADORES_FIJOS.map((nombre) => {
    const grupo = grupos.find((g) => g.nombre === nombre);
    const asigs = grupo?.asignaciones || [];
    return {
      nombre,
      total_asignadas: asigs.length,
      abonadas: asigs.filter((a) => a.estado === "Abonó").length,
      recuperadas: asigs.filter((a) => a.estado === "recuperada").length,
      total_pagado: asigs.reduce((s, a) => s + a.pagado, 0),
      total_multa: asigs.reduce((s, a) => s + a.multa, 0),
    };
  }).filter((m) => m.total_asignadas > 0);
}

export default function NicolasPage() {
  const [authState, setAuthState] = useState<"checking" | "login" | "ok">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setAuthState(data.ok ? "ok" : "login"))
      .catch(() => setAuthState("login"));
  }, []);

  const iniciarSesion = useCallback(async () => {
    if (!password.trim()) {
      setAuthError("Escribe la contraseña");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPassword("");
        setAuthState("ok");
      } else {
        setAuthError(data.error || "Contraseña incorrecta");
      }
    } catch {
      setAuthError("Sin conexión");
    } finally {
      setAuthLoading(false);
    }
  }, [password]);

  if (authState === "checking") {
    return (
      <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <main className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-zinc-500">Verificando acceso…</p>
        </main>
        <NavFooter />
      </div>
    );
  }

  if (authState === "login") {
    return (
      <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <header className="shrink-0 px-4 pb-3 border-b border-zinc-800/80">
          <h1 className="text-base font-semibold tracking-tight text-white">
            Admin — Nicolas
          </h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Acceso restringido
          </p>
        </header>
        <main className="flex-1 w-full max-w-[414px] mx-auto px-3 sm:px-4 pt-6 flex flex-col gap-4">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 flex flex-col gap-3">
            <label htmlFor="admin-password" className="text-xs text-zinc-400">
              Contraseña de administrador
            </label>
            <input
              id="admin-password"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && iniciarSesion()}
              className="w-full min-h-[50px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-lg font-semibold text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-600"
            />
            {authError && (
              <p role="alert" className="text-sm text-red-300">
                {authError}
              </p>
            )}
            <button
              type="button"
              onClick={iniciarSesion}
              disabled={authLoading}
              className="w-full min-h-[50px] rounded-xl bg-blue-700 text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform touch-manipulation"
            >
              {authLoading ? "Entrando…" : "Entrar"}
            </button>
          </section>
        </main>
        <NavFooter />
      </div>
    );
  }

  return <NicolasAdminPanel />;
}

function NicolasAdminPanel() {
  const [placas, setPlacas] = useState<PlacaDelDia[]>([]);
  const [grupos, setGrupos] = useState<RecuperadorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [nuevaPlaca, setNuevaPlaca] = useState("");
  const [nuevoGpsMoto, setNuevoGpsMoto] = useState<(typeof OPCIONES_GPS_MOTO)[number]>("iop gps");
  const [asignarPlaca, setAsignarPlaca] = useState("");
  const [asignarRecup, setAsignarRecup] = useState("");
  const [tab, setTab] = useState<"placas" | "asignadas" | "recuperadas" | "metricas">("placas");
  const [periodoMetrica, setPeriodoMetrica] = useState<PeriodoMetrica>("hoy");
  const [deudasRecuperadas, setDeudasRecuperadas] = useState<
    Record<string, DeudaPlaca | null>
  >({});
  const [cargandoDeudasRecuperadas, setCargandoDeudasRecuperadas] =
    useState(false);

  const cargarDatos = useCallback(async () => {
    const [resPlacas, resRecup] = await Promise.all([
      fetch("/api/placas"),
      fetch("/api/recuperadores"),
    ]);
    if (resPlacas.ok) {
      const data = await resPlacas.json();
      setPlacas(data.placas || []);
    }
    if (resRecup.ok) {
      const data = await resRecup.json();
      setGrupos(data.recuperadores || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    const key = "sp-sync-pagos-v1";
    if (typeof window === "undefined" || sessionStorage.getItem(key)) return;

    fetch("/api/admin/sync-pagos", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return;
        sessionStorage.setItem(key, "1");
        const data = await res.json();
        if (data.placas_actualizadas > 0) {
          setMensaje(
            `Sincronización: ${data.placas_actualizadas} placa(s) actualizada(s) según pagos en recuperadores.`,
          );
          cargarDatos();
        } else {
          sessionStorage.setItem(key, "1");
        }
      })
      .catch(() => {
        /* reintenta en próxima visita si falló */
      });
  }, [cargarDatos]);

  const agregarPlaca = useCallback(async () => {
    const p = nuevaPlaca.trim().toUpperCase().replace(/\s/g, "");
    if (!/^[A-Z0-9]{6}$/.test(p)) {
      setMensaje("La placa debe tener exactamente 6 caracteres");
      return;
    }
    setMensaje(null);
    const res = await fetch("/api/placas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placa: p, gps_moto: nuevoGpsMoto }),
    });
    if (res.ok) {
      setNuevaPlaca("");
      setNuevoGpsMoto("iop gps");
      setMensaje(`Placa ${p} publicada (${nuevoGpsMoto})`);
      cargarDatos();
    } else {
      const data = await res.json();
      setMensaje(data.error || "Error al publicar");
    }
  }, [nuevaPlaca, nuevoGpsMoto, cargarDatos]);

  const asignar = useCallback(async () => {
    if (!asignarPlaca || !asignarRecup) return;
    setMensaje(null);
    const res = await fetch("/api/asignaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placa_asignada: asignarPlaca,
        nombre_recuperador: asignarRecup,
      }),
    });
    if (res.ok) {
      setAsignarPlaca("");
      setAsignarRecup("");
      setMensaje(`Placa ${asignarPlaca} asignada a ${asignarRecup}`);
      cargarDatos();
    } else {
      const data = await res.json();
      setMensaje(data.error || "Error al asignar");
    }
  }, [asignarPlaca, asignarRecup, cargarDatos]);

  const metricas = calcularMetricas(
    filtrarGruposPorPeriodo(grupos, periodoMetrica),
  );
  const etiquetaPeriodo =
    PERIODOS_METRICA.find((p) => p.key === periodoMetrica)?.label ?? "";

  const placasPendientes = useMemo(
    () =>
      placas.filter(
        (p) => p.status === "pendiente" || p.status == null || p.status === "",
      ),
    [placas],
  );
  const asignacionesHoy = useMemo(
    () =>
      grupos.flatMap((g) =>
        g.asignaciones.map((a) => ({
          ...a,
          recuperador: g.nombre,
        })),
      ),
    [grupos],
  );
  const recuperadas = useMemo(
    () => asignacionesHoy.filter((a) => a.estado === "recuperada"),
    [asignacionesHoy],
  );

  useEffect(() => {
    if (recuperadas.length === 0) {
      setDeudasRecuperadas((prev) => (Object.keys(prev).length ? {} : prev));
      setCargandoDeudasRecuperadas(false);
      return;
    }

    const placasUnicas = [
      ...new Set(recuperadas.map((a) => a.placa.toUpperCase().replace(/\s/g, ""))),
    ];

    let cancelled = false;
    setCargandoDeudasRecuperadas(true);

    Promise.all(
      placasUnicas.map(async (placa) => {
        try {
          const res = await fetch(`/api/placa?placa=${encodeURIComponent(placa)}`, {
            cache: "no-store",
          });
          const data = await res.json();
          if (!res.ok || !data.vehiculo) return [placa, null] as const;
          const v = data.vehiculo as Record<string, string>;
          return [
            placa,
            {
              nombre: v.nombre || "—",
              deuda_total: v.deuda_total || "0",
              dias_mora: parseInt(String(v.dias_mora ?? "0"), 10) || 0,
            },
          ] as const;
        } catch {
          return [placa, null] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, DeudaPlaca | null> = {};
      for (const [placa, info] of results) {
        next[placa] = info;
      }
      setDeudasRecuperadas(next);
      setCargandoDeudasRecuperadas(false);
    });

    return () => {
      cancelled = true;
    };
  }, [recuperadas]);

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="shrink-0 px-4 pb-3 border-b border-zinc-800/80">
        <h1 className="text-base font-semibold tracking-tight text-white">
          Admin — Nicolas
        </h1>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Publicar y asignar placas del día
        </p>
      </header>

      <main className="flex-1 w-full max-w-[414px] mx-auto px-3 sm:px-4 pt-3 flex flex-col gap-3 min-h-0">
        {mensaje && (
          <div
            role="alert"
            className="shrink-0 rounded-xl border border-emerald-900/60 bg-emerald-950/40 px-3.5 py-2.5 text-sm text-emerald-200"
          >
            {mensaje}
          </div>
        )}

        {/* Publicar placa nueva */}
        <section className="shrink-0 flex flex-col gap-1.5">
          <label className="text-xs text-zinc-400 pl-0.5">
            Publicar nueva placa
          </label>
          <select
            value={nuevoGpsMoto}
            onChange={(e) =>
              setNuevoGpsMoto(e.target.value as (typeof OPCIONES_GPS_MOTO)[number])
            }
            className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-zinc-700 px-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-600"
          >
            {OPCIONES_GPS_MOTO.map((gps) => (
              <option key={gps} value={gps}>
                GPS: {gps}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Ej. TIJ66H"
              value={nuevaPlaca}
              onChange={(e) => setNuevaPlaca(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && agregarPlaca()}
              className="flex-1 min-h-[50px] rounded-xl bg-zinc-900 border border-zinc-700 px-3.5 text-lg font-semibold tracking-[0.12em] text-white placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-600"
            />
            <button
              type="button"
              onClick={agregarPlaca}
              disabled={!/^[A-Z0-9]{6}$/.test(nuevaPlaca.trim().toUpperCase().replace(/\s/g, ""))}
              className="shrink-0 min-h-[50px] min-w-[88px] rounded-xl bg-blue-700 text-white font-semibold text-sm active:scale-[0.98] transition-transform touch-manipulation"
            >
              Publicar
            </button>
          </div>
        </section>

        {/* Tabs */}
        <div className="shrink-0 flex gap-1 overflow-x-auto pb-0.5">
          {[
            { key: "placas", label: "Placas" },
            { key: "asignadas", label: "Asignadas" },
            { key: "recuperadas", label: "Recuperadas" },
            { key: "metricas", label: "Métricas" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as typeof tab)}
              className={`shrink-0 min-h-[36px] rounded-lg px-3 text-xs font-medium transition-all touch-manipulation ${
                tab === t.key
                  ? "bg-blue-700 text-white"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-700 active:bg-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-zinc-500 text-center py-4">Cargando...</p>
        ) : (
          <>
            {/* Tab: Placas del día + Asignar */}
            {tab === "placas" && (
              <div className="flex flex-col gap-4">
                {placas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">
                      No hay placas publicadas hoy
                    </p>
                  </div>
                ) : (
                  <section className="flex flex-col gap-1.5">
                    <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 pl-0.5">
                      Placas del día ({placas.length})
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      {placas.map((p) => {
                        const st = (p.status || "pendiente").toLowerCase();
                        const cerrada =
                          st === "asignada" ||
                          st === "abonada" ||
                          st === "recuperada";
                        return (
                          <span
                            key={p.id}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold tracking-wider ${
                              st === "recuperada"
                                ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60"
                                : st === "abonada"
                                  ? "bg-blue-950/60 text-blue-300 border border-blue-800/60"
                                  : st === "asignada"
                                    ? "bg-zinc-800 text-zinc-500 line-through"
                                    : "bg-zinc-900 text-white border border-zinc-700"
                            }`}
                          >
                            {p.placa}
                            <span className="text-[9px] uppercase tracking-normal text-zinc-400 font-medium">
                              {p.gps_moto || "sin gps"}
                            </span>
                            {cerrada && (
                              <span className="text-[9px] font-medium text-zinc-500 uppercase tracking-normal">
                                {st === "abonada"
                                  ? "abonó"
                                  : st === "recuperada"
                                    ? "recup"
                                    : "asig"}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Formulario asignar */}
                {placasPendientes.length > 0 && (
                  <section className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Asignar placa
                    </h2>
                    <select
                      value={asignarPlaca}
                      onChange={(e) => setAsignarPlaca(e.target.value)}
                      className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="">Seleccionar placa</option>
                      {placasPendientes.map((p) => (
                        <option key={p.id} value={p.placa}>
                          {p.placa}
                        </option>
                      ))}
                    </select>
                    <select
                      value={asignarRecup}
                      onChange={(e) => setAsignarRecup(e.target.value)}
                      className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="">Seleccionar recuperador</option>
                      {RECUPERADORES_FIJOS.map((nom) => (
                        <option key={nom} value={nom}>
                          {nom}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={asignar}
                      disabled={!asignarPlaca || !asignarRecup}
                      className="w-full min-h-[50px] rounded-xl bg-emerald-700 text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-transform touch-manipulation"
                    >
                      Asignar
                    </button>
                  </section>
                )}
              </div>
            )}

            {/* Tab: Asignadas */}
            {tab === "asignadas" && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 pl-0.5">
                  Placas asignadas ({asignacionesHoy.length})
                </h2>
                {asignacionesHoy.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">
                      No hay asignaciones aún
                    </p>
                  </div>
                ) : (
                  asignacionesHoy.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-base font-bold tracking-wider text-white">
                            {a.placa}
                          </span>
                          <span
                            className={`ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded-full ${
                              a.estado === "recuperada"
                                ? "bg-emerald-900/60 text-emerald-300"
                                : a.estado === "Abonó"
                                  ? "bg-blue-900/60 text-blue-300"
                                  : "bg-amber-900/60 text-amber-300"
                            }`}
                          >
                            {a.estado}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-zinc-300 font-medium">
                            {a.recuperador}
                          </p>
                          <p className="text-[10px] text-zinc-500 tabular-nums">
                            {formatFechaHora(a.fecha_asignada)}
                          </p>
                        </div>
                      </div>
                      {(a.estado === "Abonó" || a.foto || a.tipo_pago) && (
                        <>
                          {a.estado === "Abonó" && (
                            <div className="mt-2 flex gap-3 text-xs text-zinc-400">
                              <span>Abono: {formatearCOP(a.pagado)}</span>
                              <span>Multa: {formatearCOP(a.multa)}</span>
                            </div>
                          )}
                          <DetalleAsignacion
                            placa={a.placa}
                            tipoPago={a.tipo_pago}
                            presencial={a.presencial}
                            foto={a.foto}
                          />
                        </>
                      )}
                    </div>
                  ))
                )}
              </section>
            )}

            {/* Tab: Recuperadas */}
            {tab === "recuperadas" && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 pl-0.5">
                  Motos recuperadas ({recuperadas.length})
                </h2>
                {recuperadas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">
                      No hay motos recuperadas aún
                    </p>
                  </div>
                ) : (
                  recuperadas.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold tracking-wider text-white">
                          {a.placa}
                        </span>
                        <span className="text-[10px] text-zinc-500 tabular-nums">
                          {formatFechaHora(a.fecha_recuperada)}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-zinc-400">
                        <span>{a.recuperador}</span>
                        {deudasRecuperadas[
                          a.placa.toUpperCase().replace(/\s/g, "")
                        ] ? (
                          <span>
                            Debía:{" "}
                            {formatearCOP(
                              deudasRecuperadas[
                                a.placa.toUpperCase().replace(/\s/g, "")
                              ]!.deuda_total,
                            )}
                          </span>
                        ) : cargandoDeudasRecuperadas ? (
                          <span>Debía: …</span>
                        ) : (
                          <span>Debía: —</span>
                        )}
                      </div>
                      <DetalleAsignacion
                        placa={a.placa}
                        tipoPago={a.tipo_pago}
                        presencial={a.presencial}
                        fechaAsignada={a.fecha_asignada}
                        foto={a.foto}
                      />
                    </div>
                  ))
                )}
              </section>
            )}

            {/* Tab: Métricas */}
            {tab === "metricas" && (
              <section className="flex flex-col gap-2">
                <div className="flex flex-col gap-2">
                  <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 pl-0.5">
                    Métricas por recuperador — {etiquetaPeriodo}
                  </h2>
                  <div className="flex gap-1">
                    {PERIODOS_METRICA.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPeriodoMetrica(p.key)}
                        className={`flex-1 min-h-[34px] rounded-lg text-xs font-medium transition-all touch-manipulation ${
                          periodoMetrica === p.key
                            ? "bg-zinc-100 text-zinc-900"
                            : "bg-zinc-900 text-zinc-400 border border-zinc-700 active:bg-zinc-800"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                {metricas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">
                      Sin asignaciones en este periodo
                    </p>
                  </div>
                ) : (
                  metricas.map((m) => (
                    <div
                      key={m.nombre}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-zinc-100">
                        {m.nombre}
                      </p>
                      <div className="mt-2 grid grid-cols-5 gap-1.5 text-center text-xs">
                        <div className="rounded-lg bg-zinc-800/50 py-2">
                          <p className="text-zinc-500">Asign.</p>
                          <p className="text-white font-bold tabular-nums">
                            {m.total_asignadas}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-800/50 py-2">
                          <p className="text-zinc-500">Abonó</p>
                          <p className="text-blue-400 font-bold tabular-nums">
                            {m.abonadas}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-800/50 py-2">
                          <p className="text-zinc-500">Recup.</p>
                          <p className="text-emerald-400 font-bold tabular-nums">
                            {m.recuperadas}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-800/50 py-2">
                          <p className="text-zinc-500">Pagado</p>
                          <p className="text-white font-bold tabular-nums text-[10px]">
                            {formatearCOP(m.total_pagado)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-zinc-800/50 py-2">
                          <p className="text-zinc-500">Multas</p>
                          <p className="text-amber-400 font-bold tabular-nums text-[10px]">
                            {formatearCOP(m.total_multa)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}
          </>
        )}
      </main>
      <NavFooter />
    </div>
  );
}
