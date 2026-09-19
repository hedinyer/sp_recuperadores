"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Loader2Icon, SearchIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatearCOP } from "@/lib/formatoDinero";

export type VehiculoResumen = {
  placa: string;
  nombre: string;
  cedula: string;
  valor_cuota: string;
  deuda_total: string;
  deuda_cuotas?: string;
  deuda_multas?: string;
  fuente?: string;
};

type Destinatario = { configuracionId: number; cuenta: string };

type Props = {
  /** Prefill desde OCR / match */
  montoPrefill?: number | null;
  fechaPrefill?: string | null;
  referenciaPrefill?: string | null;
  disabled?: boolean;
  /** Compacto para el hilo del chat */
  variant?: "sidebar" | "chat";
  onRegistrado?: (info: {
    placa: string;
    monto: number;
    vehiculo: VehiculoResumen | null;
  }) => void;
  onRepetida?: (info: { placa: string; referencia: string; message: string }) => void;
};

function parseMoneyField(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function PagosRailwebPanel({
  montoPrefill,
  fechaPrefill,
  referenciaPrefill,
  disabled,
  variant = "chat",
  onRegistrado,
  onRepetida,
}: Props) {
  const placaId = useId();
  const refId = useId();
  const [placa, setPlaca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [vehiculo, setVehiculo] = useState<VehiculoResumen | null>(null);
  const [bloqueadoBga, setBloqueadoBga] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRepetida, setErrorRepetida] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [monto, setMonto] = useState("");
  const [fechaPago, setFechaPago] = useState("");
  const [referencia, setReferencia] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [configuracionId, setConfiguracionId] = useState<number | null>(null);
  const [confirmado, setConfirmado] = useState(false);

  useEffect(() => {
    if (montoPrefill != null && montoPrefill > 0) {
      setMonto(String(montoPrefill));
    }
  }, [montoPrefill]);

  useEffect(() => {
    if (fechaPrefill && /^\d{4}-\d{2}-\d{2}$/.test(fechaPrefill)) {
      setFechaPago(fechaPrefill);
    }
  }, [fechaPrefill]);

  useEffect(() => {
    if (referenciaPrefill?.trim()) {
      setReferencia(referenciaPrefill.trim());
    }
  }, [referenciaPrefill]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/pagos/tarifa/destinatarios");
        const json = (await res.json()) as {
          destinatarios?: Destinatario[];
        };
        const list = Array.isArray(json.destinatarios) ? json.destinatarios : [];
        setDestinatarios(list);
        if (list[0]) setConfiguracionId(list[0].configuracionId);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const consultarPlaca = useCallback(async () => {
    setError(null);
    setErrorRepetida(false);
    setOkMsg(null);
    setConfirmado(false);
    setBloqueadoBga(false);
    const p = placa.trim().toUpperCase();
    if (!p) {
      setError("Escribe la placa");
      return;
    }
    setBuscando(true);
    try {
      const res = await fetch(
        `/api/pagos/tarifa/placa?placa=${encodeURIComponent(p)}`,
      );
      const json = (await res.json()) as {
        error?: string;
        vehiculo?: VehiculoResumen;
        bloqueado_railweb?: boolean;
        mensaje_bloqueo?: string | null;
      };
      if (!res.ok || !json.vehiculo) {
        throw new Error(json.error ?? "No se encontró la placa");
      }
      setVehiculo(json.vehiculo);
      setPlaca(String(json.vehiculo.placa || p).toUpperCase());
      if (json.bloqueado_railweb) {
        setBloqueadoBga(true);
        setError(
          json.mensaje_bloqueo ??
            "Esta placa está activa en BGA. No registres la tarifa en Railweb.",
        );
      }
    } catch (e) {
      setVehiculo(null);
      setBloqueadoBga(false);
      setError(e instanceof Error ? e.message : "Error al consultar la placa");
    } finally {
      setBuscando(false);
    }
  }, [placa]);

  const registrar = useCallback(async () => {
    setError(null);
    setErrorRepetida(false);
    setOkMsg(null);
    if (!confirmado) {
      setError("Marca la casilla para confirmar.");
      return;
    }
    if (!vehiculo) {
      setError("Consulta la placa primero");
      return;
    }
    if (bloqueadoBga || String(vehiculo.fuente ?? "").toLowerCase() === "bga") {
      setError(
        "Esta placa está activa en BGA. No se puede registrar la tarifa en Railweb.",
      );
      return;
    }
    const p = (vehiculo.placa || placa).trim();
    const m = Math.round(Number(monto) || 0);
    const ref = referencia.trim();
    const fecha = fechaPago.trim();
    if (!p || m <= 0 || !ref || !fecha || !configuracionId) {
      setError("Completa placa, monto, fecha, referencia y destinatario.");
      return;
    }
    setRegistrando(true);
    try {
      const res = await fetch("/api/pagos/tarifa/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: p,
          monto: m,
          referencia: ref,
          fechaPago: fecha,
          configuracionId,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        repetida?: boolean;
        placa?: string;
        result?: { pagos: Array<{ pagoId: number }>; sobrante: number };
        vehiculo?: VehiculoResumen | null;
      };
      if (!res.ok || !json.result) {
        const placaMsg = (json.placa || p).toUpperCase();
        if (json.repetida) {
          const msg =
            json.error ??
            `Referencia repetida · placa ${placaMsg}`;
          setError(msg);
          setErrorRepetida(true);
          onRepetida?.({
            placa: placaMsg,
            referencia: ref,
            message: msg,
          });
          return;
        }
        throw new Error(json.error ?? "No se pudo registrar la tarifa");
      }
      const placaOk = String(json.vehiculo?.placa || p).toUpperCase();
      setOkMsg(
        `Tarifa subida a ${placaOk}: ${formatearCOP(m)} en un solo recibo.`,
      );
      if (json.vehiculo) setVehiculo(json.vehiculo);
      setConfirmado(false);
      onRegistrado?.({
        placa: placaOk,
        monto: m,
        vehiculo: json.vehiculo ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar");
    } finally {
      setRegistrando(false);
    }
  }, [
    confirmado,
    bloqueadoBga,
    vehiculo,
    placa,
    monto,
    referencia,
    fechaPago,
    configuracionId,
    onRegistrado,
    onRepetida,
  ]);

  const deuda = parseMoneyField(vehiculo?.deuda_total);
  const cuota = parseMoneyField(vehiculo?.valor_cuota);
  const listo =
    Boolean(vehiculo) &&
    !bloqueadoBga &&
    Math.round(Number(monto) || 0) > 0 &&
    Boolean(fechaPago.trim()) &&
    Boolean(referencia.trim()) &&
    Boolean(configuracionId);

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-zinc-900/60 ${
        variant === "chat" ? "p-3" : "gap-3 p-3"
      }`}
    >
      <div className="shrink-0">
        <p className="text-sm font-medium text-foreground">
          Subir tarifa a Railweb
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground text-pretty">
          El pago entró. Indica la placa y confirma.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          id={placaId}
          value={placa}
          onChange={(e) => setPlaca(e.target.value.toUpperCase())}
          placeholder="Placa"
          disabled={disabled || buscando || registrando}
          className="h-9 bg-zinc-950/60 uppercase"
          aria-label="Placa del conductor"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void consultarPlaca();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1.5"
          disabled={disabled || buscando || registrando}
          onClick={() => void consultarPlaca()}
        >
          {buscando ? (
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <SearchIcon className="size-3.5" aria-hidden />
          )}
          Buscar
        </Button>
      </div>

      {vehiculo ? (
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="col-span-2">
            <dt className="text-zinc-500">Conductor</dt>
            <dd className="mt-0.5 font-medium text-zinc-200 text-pretty">
              {vehiculo.nombre}{" "}
              <span className="tabular-nums text-zinc-400">
                · {vehiculo.cedula}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Cuota diaria</dt>
            <dd className="mt-0.5 tabular-nums font-medium text-zinc-100">
              {formatearCOP(cuota)}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">
              {bloqueadoBga ? "Debe (BGA)" : "Debe"}
            </dt>
            <dd className="mt-0.5 tabular-nums font-semibold text-amber-200">
              {formatearCOP(deuda)}
            </dd>
          </div>
        </dl>
      ) : null}

      {bloqueadoBga ? (
        <Alert className="border-amber-400/50 bg-amber-500/15 py-2">
          <AlertDescription className="text-xs text-amber-50">
            Placa activa en BGA: consulta la deuda aquí, pero no subas tarifa a
            Railweb.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Monto
          <Input
            type="number"
            inputMode="numeric"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            disabled={disabled || registrando || bloqueadoBga}
            className="h-9 bg-zinc-950/60 tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Fecha pago
          <Input
            type="date"
            value={fechaPago}
            onChange={(e) => setFechaPago(e.target.value)}
            disabled={disabled || registrando || bloqueadoBga}
            className="h-9 bg-zinc-950/60"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Referencia
        <Input
          id={refId}
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          disabled={disabled || registrando || bloqueadoBga}
          className="h-9 bg-zinc-950/60"
          placeholder="Ref. del comprobante"
        />
      </label>

      {destinatarios.length > 0 ? (
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Destinatario Nequi
          <select
            className="h-9 rounded-md border border-border bg-zinc-950 px-2 text-sm text-zinc-100"
            value={configuracionId ?? ""}
            disabled={disabled || registrando || bloqueadoBga}
            onChange={(e) =>
              setConfiguracionId(
                e.target.value ? Number(e.target.value) : null,
              )
            }
          >
            {destinatarios.map((d) => (
              <option key={d.configuracionId} value={d.configuracionId}>
                {d.cuenta}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex items-start gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={confirmado}
          disabled={registrando || !listo || bloqueadoBga}
          onChange={(e) => setConfirmado(e.target.checked)}
        />
        Confirmo subir esta tarifa a Railweb (no se borra nada).
      </label>

      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={disabled || registrando || !listo || !confirmado || bloqueadoBga}
        onClick={() => void registrar()}
      >
        {registrando ? (
          <>
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
            Subiendo…
          </>
        ) : (
          "Subir tarifa a Railweb"
        )}
      </Button>

      {error ? (
        <div
          role="alert"
          className={`rounded-xl border px-3 py-2 text-xs text-pretty ${
            errorRepetida
              ? "border-amber-400/50 bg-amber-500/15 text-amber-50"
              : "border-red-500/40 bg-red-950/40 text-red-200"
          }`}
        >
          {errorRepetida ? (
            <p className="font-semibold text-amber-100">Referencia repetida</p>
          ) : null}
          <p className={errorRepetida ? "mt-0.5" : undefined}>{error}</p>
        </div>
      ) : null}
      {okMsg ? (
        <Alert className="border-emerald-500/40 bg-emerald-950/30 py-2">
          <AlertDescription className="text-xs text-emerald-100">
            {okMsg}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
