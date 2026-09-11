"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Lote17Card } from "@/components/morosos/Lote17Card";
import { Lote17Contador } from "@/components/morosos/Lote17Contador";
import { Lote17DetalleSheet } from "@/components/morosos/Lote17DetalleSheet";
import {
  LoteAdminMetricasPanel,
  Lote17MetricasPanel,
} from "@/components/morosos/Lote17Metricas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  inicioDiaBogotaMs,
  formatearTextoGestion,
  type GestionCartera,
} from "@/lib/carteraMorososTypes";
import type {
  Lote17Item,
  Lote17Payload,
  LoteOperativoPerfilId,
} from "@/lib/carteraLotes17Types";
import { nombrePerfilCartera } from "@/lib/carteraPerfiles";
import { cn } from "@/lib/utils";

type FiltroLote = "por_hacer" | "ayer" | "pagaron" | "buscar";
type LoteVistaModo = "cuotas_17" | "atraso_3_8";

const FILTROS: Array<{ id: FiltroLote; label: string }> = [
  { id: "por_hacer", label: "Por hacer" },
  { id: "ayer", label: "Ayer" },
  { id: "pagaron", label: "Pagaron hoy" },
  { id: "buscar", label: "Buscar" },
];

const API_POR_MODO: Record<
  LoteVistaModo,
  { lista: string; titulo: string; subtitulo: string; vacioLote: string; vencidoHint: string }
> = {
  cuotas_17: {
    lista: "/api/cartera/lotes-17",
    titulo: "Mi lista 17+",
    subtitulo: "placas fijas · 4 días",
    vacioLote:
      "Crea un lote para repartir las motos 17+ entre Jhon y James.",
    vencidoHint:
      "La lista quedó cerrada. Crea un lote nuevo para repartir otra vez las motos 17+.",
  },
  atraso_3_8: {
    lista: "/api/cartera/lotes-atraso",
    titulo: "Mi lista 3–8 días",
    subtitulo: "Atraso 3 a 8 días · placas fijas · 4 días",
    vacioLote: "Crea un lote con las motos de 3 a 8 días de atraso.",
    vencidoHint:
      "La lista quedó cerrada. Crea un lote nuevo para actualizar las placas de 3 a 8 días.",
  },
};

function contactadoHoy(m: Lote17Item, perfilId: string, hoyMs: number): boolean {
  if (m.pago_hoy) return true;
  return (m.gestiones ?? []).some((g) => {
    if (g.perfil_id !== perfilId) return false;
    const t = new Date(g.created_at).getTime();
    return !Number.isNaN(t) && t >= hoyMs;
  });
}

function filtrarItems(
  items: Lote17Item[],
  filtro: FiltroLote,
  busqueda: string,
  perfilId: string,
): Lote17Item[] {
  const hoyMs = inicioDiaBogotaMs();
  const q = busqueda.trim().toUpperCase();

  let list = items;
  if (filtro === "por_hacer") {
    // Toda la lista: no contactados primero (el sort abajo los ordena)
    list = items;
  } else if (filtro === "ayer") {
    list = items.filter((m) => m.gestion_ayer);
  } else if (filtro === "pagaron") {
    list = items.filter(
      (m) =>
        m.pago_hoy ||
        (m.gestiones ?? []).some(
          (g) =>
            g.perfil_id === perfilId &&
            g.status === "abono" &&
            new Date(g.created_at).getTime() >= hoyMs,
        ),
    );
  } else if (filtro === "buscar") {
    list = !q
      ? items
      : items.filter(
          (m) =>
            m.placa.includes(q) ||
            m.nombre.toUpperCase().includes(q) ||
            m.cedula.includes(q),
        );
  }

  if (filtro !== "buscar" && q) {
    list = list.filter(
      (m) =>
        m.placa.includes(q) ||
        m.nombre.toUpperCase().includes(q) ||
        m.cedula.includes(q),
    );
  }

  // No contactados primero; contactados / pagaron hoy al final
  return [...list].sort((a, b) => {
    const ca = contactadoHoy(a, perfilId, hoyMs) ? 1 : 0;
    const cb = contactadoHoy(b, perfilId, hoyMs) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    return a.orden - b.orden;
  });
}

export function Lote17Vista({
  perfilId,
  modo = "cuotas_17",
  onError,
  onMensaje,
  onAnotar,
  onWhatsApp,
  onHistorial,
  refreshTick,
  metricasTick = 0,
  pendingPatch,
}: {
  perfilId: LoteOperativoPerfilId;
  modo?: LoteVistaModo;
  onError: (msg: string | null) => void;
  onMensaje: (msg: string | null) => void;
  onAnotar: (item: Lote17Item) => void;
  onWhatsApp: (item: Lote17Item, url: string) => void;
  onHistorial: (item: Lote17Item) => void;
  refreshTick: number;
  metricasTick?: number;
  pendingPatch: {
    placa: string;
    gestion?: GestionCartera;
    caso?: Lote17Item["caso"];
  } | null;
}) {
  const cfg = API_POR_MODO[modo];
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [payload, setPayload] = useState<Lote17Payload | null>(null);
  const [filtro, setFiltro] = useState<FiltroLote>("por_hacer");
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState<Lote17Item | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const res = await fetch(
        `${cfg.lista}?perfil_id=${encodeURIComponent(perfilId)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar tu lista");
      setPayload(data as Lote17Payload);
      if (data.auto_creado) {
        onMensaje("Lista nueva creada. Tienes 4 días.");
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [perfilId, cfg.lista, onError, onMensaje]);

  useEffect(() => {
    void cargar();
  }, [cargar, refreshTick]);

  useEffect(() => {
    if (!pendingPatch) return;
    setPayload((prev) => {
      if (!prev) return prev;
      const { placa, gestion: nueva, caso } = pendingPatch;
      const hoyMs = inicioDiaBogotaMs();
      const actual = prev.items.find((m) => m.placa === placa);
      const yaGestionadaHoy = (actual?.gestiones ?? []).some((g) => {
        if (g.perfil_id !== perfilId) return false;
        const t = new Date(g.created_at).getTime();
        return !Number.isNaN(t) && t >= hoyMs;
      });
      const yaPagoHoy = Boolean(actual?.pago_hoy);
      const sumaGestion = Boolean(nueva) && !yaGestionadaHoy;
      const sumaPago = nueva?.status === "abono" && !yaPagoHoy;

      return {
        ...prev,
        items: prev.items.map((m) => {
          if (m.placa !== placa) return m;
          return {
            ...m,
            caso: caso ?? m.caso,
            gestiones: nueva
              ? [nueva, ...(m.gestiones ?? [])].slice(0, 8)
              : m.gestiones,
            n_gestiones: (m.n_gestiones ?? 0) + (nueva ? 1 : 0),
            ultima_gestion_texto: nueva
              ? formatearTextoGestion(nueva)
              : m.ultima_gestion_texto,
            pago_hoy: m.pago_hoy || nueva?.status === "abono",
          };
        }),
        resumen: {
          ...prev.resumen,
          gestionados_hoy: prev.resumen.gestionados_hoy + (sumaGestion ? 1 : 0),
          por_hacer: Math.max(
            0,
            prev.resumen.por_hacer - (sumaGestion ? 1 : 0),
          ),
          pagaron_hoy: prev.resumen.pagaron_hoy + (sumaPago ? 1 : 0),
        },
      };
    });
  }, [pendingPatch, perfilId]);

  const crearLote = useCallback(async () => {
    setCreando(true);
    onError(null);
    onMensaje(null);
    try {
      const res = await fetch(cfg.lista, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "crear", perfil_id: perfilId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el lote");
      if (Array.isArray(data.items)) {
        setPayload(data as Lote17Payload);
      } else {
        await cargar();
      }
      onMensaje(
        `Nuevo lote listo · ${data.asignadas ?? "?"} motos asignadas`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error al crear lote");
    } finally {
      setCreando(false);
    }
  }, [perfilId, cfg.lista, cargar, onError, onMensaje]);

  const lote = payload?.lote ?? null;
  const activo = lote?.status === "activo";
  const necesitaNuevo =
    Boolean(payload?.puede_crear) ||
    (lote != null && lote.status !== "activo") ||
    (!loading && !activo && !payload?.items.length);

  const lista = useMemo(
    () => filtrarItems(payload?.items ?? [], filtro, busqueda, perfilId),
    [payload?.items, filtro, busqueda, perfilId],
  );

  const emptyCopy =
    filtro === "por_hacer"
      ? "No hay motos en tu lista."
      : filtro === "ayer"
        ? "Ayer no contactaste ninguna de esta lista."
        : filtro === "pagaron"
          ? "Nadie de tu lista pagó hoy todavía."
          : busqueda.trim()
            ? "No encontré esa placa en tu lista."
            : "Escribe la placa arriba.";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-balance">
          {cfg.titulo}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
          {nombrePerfilCartera(perfilId)} · {cfg.subtitulo}
        </p>
      </div>

      {modo === "atraso_3_8" ? (
        <LoteAdminMetricasPanel tick={metricasTick} />
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      ) : necesitaNuevo && !activo ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border px-4 py-8 text-center">
          {lote?.ends_at ? (
            <Lote17Contador endsAt={lote.ends_at} vencido />
          ) : null}
          <p className="text-base font-semibold text-foreground">
            {lote ? "El plazo de 4 días terminó" : "No hay lote activo"}
          </p>
          <p className="text-sm text-muted-foreground text-pretty">
            {lote ? cfg.vencidoHint : cfg.vacioLote}
          </p>
          <Button
            type="button"
            className="mx-auto h-12 min-w-[200px] rounded-xl text-base"
            disabled={creando}
            onClick={() => void crearLote()}
          >
            {creando ? "Creando…" : "Crear nuevo lote"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="mx-auto h-11 rounded-xl"
            onClick={() => void cargar()}
          >
            Actualizar
          </Button>
        </div>
      ) : activo && lote ? (
        <>
          <Lote17Contador endsAt={lote.ends_at} />

          {modo === "cuotas_17" ? (
            <Lote17MetricasPanel tick={metricasTick} />
          ) : null}

          <p className="text-sm tabular-nums text-muted-foreground">
            Te faltan{" "}
            <span className="font-semibold text-foreground">
              {payload?.resumen.por_hacer ?? 0}
            </span>{" "}
            de {payload?.resumen.total ?? 0}. Hoy gestionaste{" "}
            <span className="font-semibold text-foreground">
              {payload?.resumen.gestionados_hoy ?? 0}
            </span>
            .
          </p>

          <div
            role="tablist"
            aria-label="Filtros de tu lista"
            className="grid grid-cols-2 gap-2"
          >
            {FILTROS.map((f) => {
              const selected = filtro === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    "min-h-12 rounded-xl border px-2 text-sm font-semibold touch-manipulation transition-[background-color,border-color,color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground",
                  )}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {filtro === "buscar" ? (
            <div>
              <label
                htmlFor="lote-fijo-buscar"
                className="mb-1.5 block text-sm font-medium"
              >
                Buscar placa, nombre o cédula
              </label>
              <Input
                id="lote-fijo-buscar"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Ej: ABC123"
                className="h-12 rounded-xl text-base"
                autoFocus
              />
            </div>
          ) : null}

          {lista.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
              <p className="text-sm font-medium text-foreground">{emptyCopy}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {lista.map((item) => (
                <li key={item.placa}>
                  <Lote17Card
                    item={item}
                    onWhatsApp={onWhatsApp}
                    onAnotar={onAnotar}
                    onDetalle={setDetalle}
                  />
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => void cargar()}
          >
            Actualizar lista
          </Button>
        </>
      ) : (
        <Alert>
          <AlertDescription>
            No hay lote activo. Pulsa actualizar o crea uno nuevo.
          </AlertDescription>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-11 rounded-xl"
              disabled={creando}
              onClick={() => void crearLote()}
            >
              Crear nuevo lote
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => void cargar()}
            >
              Actualizar
            </Button>
          </div>
        </Alert>
      )}

      <Lote17DetalleSheet
        open={Boolean(detalle)}
        onOpenChange={(open) => {
          if (!open) setDetalle(null);
        }}
        item={detalle}
        disabled={!activo}
        onAnotar={onAnotar}
        onHistorial={onHistorial}
      />
    </div>
  );
}

