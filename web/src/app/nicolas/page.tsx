"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DetalleAsignacion } from "@/components/DetalleAsignacion";
import { NavFooter } from "@/components/NavFooter";
import { formatFechaHora } from "@/lib/fechas";
import {
  enPeriodo,
  PERIODOS_METRICA,
  type MetricasRecuperador,
  type PeriodoMetrica,
} from "@/lib/metricasRecuperadores";
import {
  etiquetaRecuperador,
  RECUPERADORES_FIJOS,
} from "@/lib/recuperadores";

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
    fecha_abono: string | null;
    foto: string | null;
    tipo_pago: string | null;
    presencial: boolean | null;
  }>;
};

type DeudaPlaca = {
  nombre: string;
  deuda_total: string;
  dias_mora: number;
};

function esPendiente(estado: string | null | undefined): boolean {
  const e = String(estado ?? "pendiente").trim().toLowerCase();
  return !e || e === "pendiente";
}

const OPCIONES_GPS_MOTO = ["iop gps", "ds track"] as const;

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
  const [tab, setTab] = useState<
    "placas" | "asignadas" | "recuperadas" | "metricas" | "reasignar"
  >("placas");
  const [reasignarDesde, setReasignarDesde] = useState("");
  const [reasignarHacia, setReasignarHacia] = useState("");
  const [reasignarIds, setReasignarIds] = useState<Set<number>>(() => new Set());
  const [reasignando, setReasignando] = useState(false);
  const [periodoMetrica, setPeriodoMetrica] = useState<PeriodoMetrica>("hoy");
  const [metricas, setMetricas] = useState<MetricasRecuperador[]>([]);
  const [cargandoMetricas, setCargandoMetricas] = useState(false);
  const [deudasRecuperadas, setDeudasRecuperadas] = useState<
    Record<string, DeudaPlaca | null>
  >({});
  const [cargandoDeudasRecuperadas, setCargandoDeudasRecuperadas] =
    useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

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

  const placasEnPendiente = useMemo(() => {
    const set = new Set<string>();
    for (const p of placas) {
      const st = (p.status || "pendiente").toLowerCase();
      if (st === "pendiente") {
        set.add(p.placa.toUpperCase().replace(/\s/g, ""));
      }
    }
    for (const g of grupos) {
      for (const a of g.asignaciones) {
        if (a.estado === "pendiente" || !a.estado) {
          set.add(a.placa.toUpperCase().replace(/\s/g, ""));
        }
      }
    }
    return set;
  }, [placas, grupos]);

  const nuevaPlacaNorm = nuevaPlaca.trim().toUpperCase().replace(/\s/g, "");
  const nuevaPlacaYaPendiente =
    nuevaPlacaNorm.length === 6 && placasEnPendiente.has(nuevaPlacaNorm);
  const nuevaPlacaValida =
    /^[A-Z0-9]{6}$/.test(nuevaPlacaNorm) && !nuevaPlacaYaPendiente;

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    if (tab !== "metricas") return;

    let cancelled = false;
    setCargandoMetricas(true);

    fetch(`/api/metricas?periodo=${encodeURIComponent(periodoMetrica)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return { metricas: [] as MetricasRecuperador[] };
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setMetricas(data.metricas ?? []);
        setCargandoMetricas(false);
      })
      .catch(() => {
        if (!cancelled) {
          setMetricas([]);
          setCargandoMetricas(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tab, periodoMetrica]);

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
    if (placasEnPendiente.has(p)) {
      setMensaje("Esta placa ya está pendiente (publicada o asignada sin gestionar)");
      return;
    }
    setMensaje(null);
    const res = await fetch("/api/placas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placa: p, gps_moto: nuevoGpsMoto }),
    });
    if (res.ok) {
      const data = await res.json();
      setNuevaPlaca("");
      setNuevoGpsMoto("iop gps");
      const multa = data.multa as
        | { creada?: boolean; monto?: number; motivo?: string | null }
        | undefined;
      let texto = `Placa ${p} publicada (${nuevoGpsMoto})`;
      if (multa?.creada) {
        texto += `. Multa de $${(multa.monto ?? 25000).toLocaleString("es-CO")} registrada en el ERP`;
      } else if (multa && !multa.creada) {
        texto +=
          ". Aviso: no se pudo registrar la multa en el ERP; revisa manualmente";
      }
      setMensaje(texto);
      cargarDatos();
    } else {
      const data = await res.json();
      setMensaje(data.error || "Error al publicar");
    }
  }, [nuevaPlaca, nuevoGpsMoto, cargarDatos, placasEnPendiente]);

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

  const eliminarPendiente = useCallback(
    async (id: number, placa: string) => {
      if (
        !window.confirm(
          `¿Eliminar ${placa} de pendientes? Se quitará la asignación y la publicación en placas.`,
        )
      ) {
        return;
      }
      setMensaje(null);
      setEliminandoId(id);
      try {
        const res = await fetch("/api/asignaciones", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const data = await res.json();
        if (res.ok) {
          setMensaje(`Placa ${placa} eliminada`);
          await cargarDatos();
        } else {
          setMensaje(data.error || "Error al eliminar");
        }
      } catch {
        setMensaje("Error de conexión al eliminar");
      } finally {
        setEliminandoId(null);
      }
    },
    [cargarDatos],
  );

  const asignacionesReasignables = useMemo(
    () =>
      grupos.flatMap((g) =>
        g.asignaciones
          .filter((a) => esPendiente(a.estado))
          .map((a) => ({ ...a, recuperador: g.nombre })),
      ),
    [grupos],
  );

  const recuperadoresConPendientes = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const a of asignacionesReasignables) {
      conteo.set(a.recuperador, (conteo.get(a.recuperador) ?? 0) + 1);
    }
    const lista: { nombre: string; total: number }[] = RECUPERADORES_FIJOS.filter(
      (nom) => conteo.has(nom),
    ).map((nom) => ({ nombre: nom, total: conteo.get(nom) ?? 0 }));
    for (const [nom, total] of conteo) {
      if (!RECUPERADORES_FIJOS.includes(nom)) {
        lista.push({ nombre: nom, total });
      }
    }
    return lista;
  }, [asignacionesReasignables]);

  const listaReasignar = useMemo(
    () =>
      reasignarDesde
        ? asignacionesReasignables.filter((a) => a.recuperador === reasignarDesde)
        : [],
    [asignacionesReasignables, reasignarDesde],
  );

  useEffect(() => {
    setReasignarIds(new Set());
  }, [reasignarDesde]);

  const toggleReasignarId = useCallback((id: number) => {
    setReasignarIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const ejecutarReasignar = useCallback(
    async (ids: number[]) => {
      if (!reasignarHacia || ids.length === 0) return;
      if (reasignarHacia === reasignarDesde) {
        setMensaje("Elige un recuperador distinto al actual");
        return;
      }
      setMensaje(null);
      setReasignando(true);
      try {
        const res = await fetch("/api/asignaciones/reasignar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids,
            nombre_recuperador: reasignarHacia,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setReasignarIds(new Set());
          setMensaje(
            `${data.reasignadas} placa(s) reasignada(s) a ${etiquetaRecuperador(reasignarHacia)}`,
          );
          await cargarDatos();
        } else {
          setMensaje(data.error || "Error al reasignar");
        }
      } catch {
        setMensaje("Error de conexión al reasignar");
      } finally {
        setReasignando(false);
      }
    },
    [reasignarHacia, reasignarDesde, cargarDatos],
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
  const todasAsignaciones = useMemo(
    () =>
      grupos.flatMap((g) =>
        g.asignaciones.map((a) => ({
          ...a,
          recuperador: g.nombre,
        })),
      ),
    [grupos],
  );
  const asignacionesHoy = useMemo(
    () =>
      todasAsignaciones.filter(
        (a) => a.estado === "pendiente" || !a.estado,
      ),
    [todasAsignaciones],
  );
  const recuperadas = useMemo(
    () =>
      todasAsignaciones.filter(
        (a) =>
          a.estado === "recuperada" &&
          enPeriodo(a.fecha_recuperada, "hoy"),
      ),
    [todasAsignaciones],
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
          <p className="text-[11px] text-zinc-500 pl-0.5">
            Al publicar se registra multa de $25.000 en el ERP.
          </p>
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
              onKeyDown={(e) => e.key === "Enter" && nuevaPlacaValida && agregarPlaca()}
              className={`flex-1 min-h-[50px] rounded-xl bg-zinc-900 border px-3.5 text-lg font-semibold tracking-[0.12em] text-white placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-normal focus:outline-none focus:ring-2 ${
                nuevaPlacaYaPendiente
                  ? "border-amber-700 focus:ring-amber-500/50 focus:border-amber-600"
                  : "border-zinc-700 focus:ring-blue-500/50 focus:border-blue-600"
              }`}
            />
            <button
              type="button"
              onClick={agregarPlaca}
              disabled={!nuevaPlacaValida}
              className="shrink-0 min-h-[50px] min-w-[88px] rounded-xl bg-blue-700 text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-transform touch-manipulation"
            >
              Publicar
            </button>
          </div>
          {nuevaPlacaYaPendiente ? (
            <p className="text-xs text-amber-400 pl-0.5">
              Ya está pendiente en placas o con un recuperador asignado
            </p>
          ) : null}
        </section>

        {/* Tabs */}
        <div className="shrink-0 grid grid-cols-5 gap-1">
          {[
            { key: "placas", label: "Placas" },
            { key: "asignadas", label: "Asignadas" },
            { key: "recuperadas", label: "Recuperadas" },
            { key: "metricas", label: "Métricas" },
            { key: "reasignar", label: "Reasignar" },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as typeof tab)}
              className={`min-h-[36px] rounded-lg px-0.5 text-[9px] sm:text-[10px] font-medium text-center leading-tight transition-all touch-manipulation ${
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
                ) : placasPendientes.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">
                      Todas las placas del día ya están asignadas
                    </p>
                  </div>
                ) : (
                  <section className="flex flex-col gap-1.5">
                    <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 pl-0.5">
                      Pendientes por asignar ({placasPendientes.length})
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                      {placasPendientes.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold tracking-wider bg-zinc-900 text-white border border-zinc-700"
                        >
                          {p.placa}
                          <span className="text-[9px] uppercase tracking-normal text-zinc-400 font-medium">
                            {p.gps_moto || "sin gps"}
                          </span>
                        </span>
                      ))}
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
                          {etiquetaRecuperador(nom)}
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
                  Pendientes ({asignacionesHoy.length})
                </h2>
                {asignacionesHoy.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">
                      No hay placas pendientes de gestión
                    </p>
                  </div>
                ) : (
                  asignacionesHoy.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
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
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-zinc-300 font-medium">
                              {etiquetaRecuperador(a.recuperador)}
                            </p>
                            <p className="text-[10px] text-zinc-500 tabular-nums">
                              {formatFechaHora(a.fecha_asignada)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => eliminarPendiente(a.id, a.placa)}
                            disabled={eliminandoId === a.id}
                            aria-label={`Eliminar ${a.placa}`}
                            className="min-h-[36px] min-w-[36px] rounded-lg border border-red-900/60 bg-red-950/40 text-red-400 text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-transform touch-manipulation"
                          >
                            {eliminandoId === a.id ? "…" : "✕"}
                          </button>
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
                  Motos recuperadas hoy ({recuperadas.length})
                </h2>
                {recuperadas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">
                      No hay motos recuperadas hoy
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
                        <span>{etiquetaRecuperador(a.recuperador)}</span>
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
                {cargandoMetricas ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">Cargando métricas…</p>
                  </div>
                ) : metricas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">
                      Sin actividad en este periodo
                    </p>
                  </div>
                ) : (
                  metricas.map((m) => (
                    <div
                      key={m.nombre}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-zinc-100">
                        {etiquetaRecuperador(m.nombre)}
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

            {/* Tab: Reasignar */}
            {tab === "reasignar" && (
              <section className="flex flex-col gap-3">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 pl-0.5">
                  Placas pendientes por recuperador
                </h2>

                {asignacionesReasignables.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-8 text-center">
                    <p className="text-sm text-zinc-500">
                      No hay placas pendientes para reasignar
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-2">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Recuperador actual
                      </label>
                      <select
                        value={reasignarDesde}
                        onChange={(e) => setReasignarDesde(e.target.value)}
                        className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="">Seleccionar recuperador</option>
                        {recuperadoresConPendientes.map((r) => (
                          <option key={r.nombre} value={r.nombre}>
                            {etiquetaRecuperador(r.nombre)} ({r.total})
                          </option>
                        ))}
                      </select>

                      {!reasignarDesde ? (
                        <ul className="mt-1 flex flex-col gap-1.5">
                          {recuperadoresConPendientes.map((r) => (
                            <li
                              key={r.nombre}
                              className="flex justify-between text-xs text-zinc-400 px-1"
                            >
                              <span>{etiquetaRecuperador(r.nombre)}</span>
                              <span className="tabular-nums text-zinc-500">
                                {r.total} pendiente{r.total !== 1 ? "s" : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    {reasignarDesde && listaReasignar.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between gap-2 px-0.5">
                          <p className="text-xs text-zinc-400">
                            {reasignarIds.size} de {listaReasignar.length}{" "}
                            seleccionada
                            {reasignarIds.size !== 1 ? "s" : ""}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setReasignarIds(
                                new Set(listaReasignar.map((a) => a.id)),
                              )
                            }
                            className="text-xs font-medium text-blue-400 active:text-blue-300 touch-manipulation"
                          >
                            Seleccionar todas
                          </button>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          {listaReasignar.map((a) => {
                            const marcada = reasignarIds.has(a.id);
                            return (
                              <label
                                key={a.id}
                                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 touch-manipulation cursor-pointer transition-colors ${
                                  marcada
                                    ? "border-blue-600/60 bg-blue-950/30"
                                    : "border-zinc-800 bg-zinc-900/60 active:bg-zinc-800/80"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={marcada}
                                  onChange={() => toggleReasignarId(a.id)}
                                  className="h-5 w-5 shrink-0 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500/50"
                                />
                                <div className="flex-1 min-w-0">
                                  <span className="text-base font-bold tracking-wider text-white">
                                    {a.placa}
                                  </span>
                                  <p className="text-[10px] text-zinc-500 tabular-nums mt-0.5">
                                    Asignada{" "}
                                    {formatFechaHora(a.fecha_asignada)}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col gap-2">
                          <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                            Reasignar a
                          </label>
                          <select
                            value={reasignarHacia}
                            onChange={(e) => setReasignarHacia(e.target.value)}
                            className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3.5 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          >
                            <option value="">Seleccionar recuperador</option>
                            {RECUPERADORES_FIJOS.filter(
                              (nom) => nom !== reasignarDesde,
                            ).map((nom) => (
                              <option key={nom} value={nom}>
                                {etiquetaRecuperador(nom)}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            disabled={
                              reasignando ||
                              reasignarIds.size === 0 ||
                              !reasignarHacia
                            }
                            onClick={() =>
                              ejecutarReasignar([...reasignarIds])
                            }
                            className="w-full min-h-[50px] rounded-xl bg-blue-700 text-white font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-transform touch-manipulation"
                          >
                            {reasignando
                              ? "Reasignando…"
                              : `Reasignar seleccionadas (${reasignarIds.size})`}
                          </button>

                          <button
                            type="button"
                            disabled={reasignando || !reasignarHacia}
                            onClick={() =>
                              ejecutarReasignar(
                                listaReasignar.map((a) => a.id),
                              )
                            }
                            className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 text-zinc-200 font-medium text-sm disabled:opacity-40 active:scale-[0.98] transition-transform touch-manipulation"
                          >
                            {reasignando
                              ? "Reasignando…"
                              : `Reasignar todas (${listaReasignar.length}) a ${reasignarHacia ? etiquetaRecuperador(reasignarHacia) : "…"}`}
                          </button>
                        </div>
                      </>
                    ) : reasignarDesde ? (
                      <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-6 text-center">
                        <p className="text-sm text-zinc-500">
                          Este recuperador no tiene placas pendientes
                        </p>
                      </div>
                    ) : null}
                  </>
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
