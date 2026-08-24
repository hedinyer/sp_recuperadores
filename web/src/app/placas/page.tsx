"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { MasterGate } from "@/components/MasterGate";
import { NavFooter } from "@/components/NavFooter";
import type { MorosoBandeja } from "@/lib/carteraMorososTypes";
import {
  CATEGORIAS_MOROSO,
  type CategoriaMoroso,
} from "@/lib/categoriasMorosos";
import {
  CARTERA_PERFILES,
  CARTERA_PERFIL_STORAGE_KEY,
  CARTERA_STATUSES,
  esPerfilCarteraId,
  etiquetaCarteraStatus,
  nombrePerfilCartera,
  type CarteraPerfilId,
  type CarteraStatus,
} from "@/lib/carteraPerfiles";
import { formatFechaCorta, formatFechaHora } from "@/lib/fechas";
import { formatearCOP } from "@/lib/formatoDinero";

type ResumenApi = {
  total: number;
  counts: Record<CategoriaMoroso, number>;
  deuda_total: number;
  generado_en: string;
};

type GestionItem = {
  id: number;
  placa: string;
  perfil_id: string;
  status: string;
  categoria: string | null;
  notas: string | null;
  created_at: string;
};

function enlaceWhatsApp(telefono: string, texto: string): string | null {
  const digits = telefono.replace(/\D/g, "");
  if (!digits) return null;
  const conPais = digits.startsWith("57")
    ? digits
    : digits.startsWith("0")
      ? `57${digits.slice(1)}`
      : `57${digits}`;
  return `https://wa.me/${conPais}?text=${encodeURIComponent(texto)}`;
}

function BadgeGps({ funcional, etiqueta }: { funcional: boolean; etiqueta: string }) {
  if (funcional) {
    return (
      <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/50 px-1.5 py-0.5 rounded">
        GPS activo
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
      {etiqueta || "Sin GPS"}
    </span>
  );
}

function emptyCategorias(): Record<CategoriaMoroso, MorosoBandeja[]> {
  return {
    bajo_pago: [],
    sin_gps: [],
    mora_15: [],
    mora_4_15: [],
  };
}

export default function PlacasMorososPage() {
  const tabsId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const historialRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const [perfilId, setPerfilId] = useState<CarteraPerfilId | null>(null);
  const [categoria, setCategoria] = useState<CategoriaMoroso>("bajo_pago");
  const [categorias, setCategorias] =
    useState<Record<CategoriaMoroso, MorosoBandeja[]>>(emptyCategorias);
  const [resumen, setResumen] = useState<ResumenApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const [motoActiva, setMotoActiva] = useState<MorosoBandeja | null>(null);
  const [statusDraft, setStatusDraft] = useState<CarteraStatus>("contactado");
  const [notasDraft, setNotasDraft] = useState("");
  const [guardando, setGuardando] = useState(false);

  const [historial, setHistorial] = useState<GestionItem[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState<string | null>(null);
  const [historialPlaca, setHistorialPlaca] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CARTERA_PERFIL_STORAGE_KEY);
      if (saved && esPerfilCarteraId(saved)) setPerfilId(saved);
    } catch {
      // ignore
    }
  }, []);

  const elegirPerfil = useCallback((id: CarteraPerfilId) => {
    setPerfilId(id);
    try {
      sessionStorage.setItem(CARTERA_PERFIL_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const cargar = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const q = refresh ? "?refresh=1" : "";
      const res = await fetch(`/api/cartera/morosos${q}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar morosos");
      setCategorias(data.categorias ?? emptyCategorias());
      setResumen(data.resumen ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
      setCategorias(emptyCategorias());
      setResumen(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const listaBase = categorias[categoria] ?? [];
  const lista = (() => {
    const q = busqueda.trim().toUpperCase();
    if (!q) return listaBase;
    return listaBase.filter(
      (m) =>
        m.placa.includes(q) ||
        m.nombre.toUpperCase().includes(q) ||
        m.cedula.includes(q),
    );
  })();

  const metaCategoria = CATEGORIAS_MOROSO.find((c) => c.id === categoria);

  const abrirGestion = useCallback(
    (moto: MorosoBandeja, el: HTMLElement) => {
      if (!perfilId) {
        setError("Elige tu perfil para gestionar");
        return;
      }
      triggerRef.current = el;
      setMotoActiva(moto);
      setStatusDraft(
        (moto.caso?.status as CarteraStatus) &&
          CARTERA_STATUSES.some((s) => s.id === moto.caso?.status)
          ? (moto.caso!.status as CarteraStatus)
          : "contactado",
      );
      setNotasDraft(moto.caso?.notas ?? "");
      const dlg = dialogRef.current;
      if (dlg && !dlg.open) dlg.showModal();
    },
    [perfilId],
  );

  const cerrarGestion = useCallback(() => {
    dialogRef.current?.close();
    setMotoActiva(null);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  const guardarGestion = useCallback(async () => {
    if (!motoActiva || !perfilId) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const res = await fetch("/api/cartera/gestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: motoActiva.placa,
          perfil_id: perfilId,
          status: statusDraft,
          notas: notasDraft,
          categoria: motoActiva.categoria,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");

      setCategorias((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next) as CategoriaMoroso[]) {
          next[key] = next[key].map((m) =>
            m.placa === motoActiva.placa
              ? {
                  ...m,
                  caso: data.caso ?? {
                    placa: motoActiva.placa,
                    perfil_id: perfilId,
                    categoria: motoActiva.categoria,
                    status: statusDraft,
                    notas: notasDraft || null,
                    updated_at: new Date().toISOString(),
                  },
                }
              : m,
          );
        }
        return next;
      });
      setMensaje(
        `Gestión guardada · ${motoActiva.placa} · ${etiquetaCarteraStatus(statusDraft)}`,
      );
      cerrarGestion();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }, [motoActiva, perfilId, statusDraft, notasDraft, cerrarGestion]);

  const abrirHistorial = useCallback(
    async (moto: MorosoBandeja, el: HTMLElement) => {
      triggerRef.current = el;
      setHistorialPlaca(moto.placa);
      setHistorial([]);
      setHistorialError(null);
      setHistorialLoading(true);
      historialRef.current?.showModal();
      try {
        const res = await fetch(
          `/api/cartera/gestion?placa=${encodeURIComponent(moto.placa)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo cargar historial");
        setHistorial(data.items ?? []);
      } catch (e) {
        setHistorialError(
          e instanceof Error ? e.message : "Error al cargar historial",
        );
      } finally {
        setHistorialLoading(false);
      }
    },
    [],
  );

  const cerrarHistorial = useCallback(() => {
    historialRef.current?.close();
    setHistorialPlaca(null);
    queueMicrotask(() => triggerRef.current?.focus());
  }, []);

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
      <MasterGate title="Morosos" subtitle="Requiere clave master">
        <header className="shrink-0 border-b border-zinc-800 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight">Morosos</h1>
              <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                Categorías exclusivas y seguimiento por perfil
              </p>
            </div>
            <button
              type="button"
              onClick={() => void cargar(true)}
              disabled={loading}
              className="shrink-0 min-h-[44px] px-3 rounded-xl border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300 disabled:opacity-50 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              {loading ? "Cargando…" : "Actualizar"}
            </button>
          </div>

          <fieldset className="mt-4">
            <legend className="text-xs text-zinc-400 mb-2">Tu perfil</legend>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Perfil de trabajo"
            >
              {CARTERA_PERFILES.map((p) => {
                const activo = perfilId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => elegirPerfil(p.id)}
                    className={`min-h-[44px] px-3 rounded-xl border text-sm font-semibold touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${
                      activo
                        ? "border-amber-600/70 bg-amber-950/50 text-amber-100"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400"
                    }`}
                  >
                    {p.nombre}
                  </button>
                );
              })}
            </div>
            {!perfilId && (
              <p className="mt-2 text-xs text-amber-300/90" role="status">
                Elige tu perfil para gestionar
              </p>
            )}
          </fieldset>

          {resumen && !loading && (
            <p className="mt-3 text-[11px] text-zinc-500 tabular-nums">
              {resumen.total} motos · deuda {formatearCOP(resumen.deuda_total)}
            </p>
          )}
        </header>

        <main className="flex-1 w-full max-w-[414px] mx-auto px-3 sm:px-4 pt-3 pb-4 flex flex-col gap-3 min-h-0">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-900/60 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
            >
              {error}
            </div>
          )}
          {mensaje && (
            <div
              role="status"
              className="rounded-xl border border-emerald-900/60 bg-emerald-950/40 px-3.5 py-2.5 text-sm text-emerald-200"
            >
              {mensaje}
            </div>
          )}

          <div
            role="tablist"
            aria-label="Categorías de mora"
            className="grid grid-cols-2 gap-2"
            onKeyDown={(e) => {
              const ids = CATEGORIAS_MOROSO.map((c) => c.id);
              const i = ids.indexOf(categoria);
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                setCategoria(ids[(i + 1) % ids.length]!);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                setCategoria(ids[(i - 1 + ids.length) % ids.length]!);
              } else if (e.key === "Home") {
                e.preventDefault();
                setCategoria(ids[0]!);
              } else if (e.key === "End") {
                e.preventDefault();
                setCategoria(ids[ids.length - 1]!);
              }
            }}
          >
            {CATEGORIAS_MOROSO.map((cat) => {
              const count = resumen?.counts?.[cat.id] ?? categorias[cat.id].length;
              const panelId = `${tabsId}-panel-${cat.id}`;
              const tabId = `${tabsId}-tab-${cat.id}`;
              return (
                <button
                  key={cat.id}
                  id={tabId}
                  type="button"
                  role="tab"
                  aria-selected={categoria === cat.id}
                  aria-controls={panelId}
                  tabIndex={categoria === cat.id ? 0 : -1}
                  onClick={() => setCategoria(cat.id)}
                  className={`min-h-[52px] rounded-xl border px-2.5 py-2 text-left touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${
                    categoria === cat.id
                      ? "border-emerald-600/70 bg-emerald-950/40 text-emerald-100"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                  }`}
                >
                  <span className="block text-xs font-semibold leading-tight">
                    {cat.label}
                  </span>
                  <span className="block text-[11px] tabular-nums mt-0.5 opacity-80">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            {metaCategoria?.descripcion}
          </p>

          <div>
            <label htmlFor="buscar-morosos" className="sr-only">
              Buscar por placa, nombre o cédula
            </label>
            <input
              id="buscar-morosos"
              type="search"
              placeholder="Buscar placa, nombre o cédula"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-zinc-700 px-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
            />
          </div>

          <section
            id={`${tabsId}-panel-${categoria}`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-tab-${categoria}`}
            className="flex-1 min-h-0"
          >
            {loading ? (
              <p className="text-sm text-zinc-500 text-center py-10">
                Cargando morosos…
              </p>
            ) : lista.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-10">
                Sin motos en {metaCategoria?.label.toLowerCase() ?? "esta categoría"}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {lista.map((m) => {
                  const waTexto = `Hola ${m.nombre.split(" ")[0] || ""}, te escribimos por el atraso de la moto ${m.placa}. Deuda aproximada: ${formatearCOP(m.deuda_total)}.`;
                  const wa = enlaceWhatsApp(m.telefono, waTexto);
                  const status = m.caso?.status ?? "pendiente";
                  return (
                    <li
                      key={m.placa}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5 flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-lg font-bold tracking-[0.14em] text-white">
                            {m.placa}
                          </p>
                          <p className="mt-0.5 text-sm text-zinc-200 truncate">
                            {m.nombre || "—"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <BadgeGps
                            funcional={m.gps.funcional}
                            etiqueta={m.gps.estado_etiqueta}
                          />
                          <span className="text-[10px] font-semibold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded">
                            {etiquetaCarteraStatus(status)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] uppercase text-zinc-500">
                            Deuda
                          </p>
                          <p className="text-sm font-semibold text-rose-300 tabular-nums">
                            {formatearCOP(m.deuda_total)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-zinc-500">
                            Mora
                          </p>
                          <p className="text-sm font-semibold tabular-nums">
                            {m.dias_mora}d
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-zinc-500">
                            Cumple
                          </p>
                          <p className="text-sm font-semibold tabular-nums">
                            {m.cumplimiento_pct}%
                          </p>
                        </div>
                      </div>

                      <p className="text-[11px] text-zinc-500">
                        Últ. pago {formatFechaCorta(m.ultimo_pago) || "—"}
                        {m.caso?.perfil_id
                          ? ` · ${nombrePerfilCartera(m.caso.perfil_id)}`
                          : ""}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-h-[44px] min-w-[7rem] inline-flex items-center justify-center rounded-xl bg-[#25D366] text-sm font-semibold text-white touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                        <button
                          type="button"
                          disabled={!perfilId}
                          onClick={(e) => abrirGestion(m, e.currentTarget)}
                          className="flex-1 min-h-[44px] min-w-[7rem] rounded-xl bg-emerald-700 text-sm font-semibold text-white disabled:opacity-40 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                        >
                          Actualizar estado
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void abrirHistorial(m, e.currentTarget)}
                          className="flex-1 min-h-[44px] min-w-[7rem] rounded-xl border border-zinc-700 bg-zinc-800 text-sm font-semibold text-zinc-200 touch-manipulation focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
                        >
                          Ver historial
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>

        <dialog
          ref={dialogRef}
          className="w-[calc(100%-2rem)] max-w-[400px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 shadow-2xl backdrop:bg-black/70 open:flex open:flex-col open:gap-3"
          onClose={() => setMotoActiva(null)}
          onCancel={(e) => {
            e.preventDefault();
            cerrarGestion();
          }}
        >
          {motoActiva && (
            <>
              <h2 className="text-base font-semibold text-white">
                Actualizar estado
              </h2>
              <p className="text-xs text-zinc-500">
                {motoActiva.placa} · {motoActiva.nombre}
                {perfilId ? ` · ${nombrePerfilCartera(perfilId)}` : ""}
              </p>
              <div>
                <label
                  htmlFor="cartera-status"
                  className="text-xs text-zinc-400 block mb-1"
                >
                  Estado
                </label>
                <select
                  id="cartera-status"
                  value={statusDraft}
                  onChange={(e) =>
                    setStatusDraft(e.target.value as CarteraStatus)
                  }
                  className="w-full min-h-[48px] rounded-xl bg-zinc-800 border border-zinc-600 px-3 text-base text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                >
                  {CARTERA_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="cartera-notas"
                  className="text-xs text-zinc-400 block mb-1"
                >
                  Nota (opcional)
                </label>
                <textarea
                  id="cartera-notas"
                  rows={3}
                  value={notasDraft}
                  onChange={(e) => setNotasDraft(e.target.value)}
                  placeholder="Qué quedó acordado…"
                  className="w-full rounded-xl bg-zinc-800 border border-zinc-600 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                />
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={cerrarGestion}
                  className="flex-1 min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-300 font-medium text-sm touch-manipulation"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void guardarGestion()}
                  disabled={guardando}
                  className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 touch-manipulation"
                >
                  {guardando ? "Guardando…" : "Guardar gestión"}
                </button>
              </div>
            </>
          )}
        </dialog>

        <dialog
          ref={historialRef}
          className="w-[calc(100%-2rem)] max-w-[400px] rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 shadow-2xl backdrop:bg-black/70 open:flex open:flex-col open:gap-3"
          onCancel={(e) => {
            e.preventDefault();
            cerrarHistorial();
          }}
        >
          <h2 className="text-base font-semibold text-white">Historial</h2>
          <p className="text-xs text-zinc-500 tracking-widest">
            {historialPlaca}
          </p>
          <div className="max-h-[50vh] overflow-y-auto">
            {historialLoading ? (
              <p className="text-sm text-zinc-500 py-6 text-center">
                Cargando…
              </p>
            ) : historialError ? (
              <p role="alert" className="text-sm text-red-300 py-4">
                {historialError}
              </p>
            ) : historial.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center">
                Sin gestiones registradas
              </p>
            ) : (
              <ul className="divide-y divide-zinc-800">
                {historial.map((g) => (
                  <li key={g.id} className="py-3">
                    <p className="text-sm font-medium text-zinc-100">
                      {etiquetaCarteraStatus(g.status)}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {nombrePerfilCartera(g.perfil_id)} ·{" "}
                      {formatFechaHora(g.created_at)}
                    </p>
                    {g.notas ? (
                      <p className="text-xs text-zinc-400 mt-1">{g.notas}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={cerrarHistorial}
            className="w-full min-h-[48px] rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-200 font-semibold text-sm touch-manipulation"
          >
            Cerrar
          </button>
        </dialog>
      </MasterGate>
      <NavFooter />
    </div>
  );
}
