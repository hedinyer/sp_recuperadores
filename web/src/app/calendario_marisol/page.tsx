"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Evento = {
  id: string;
  uid: string;
  summary: string;
  description: string;
  dtstart: string;
  dtend: string;
};

const TOKEN_KEY = "calendario_marisol_token";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

export default function CalendarioMarisolPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [dtstart, setDtstart] = useState("");
  const [dtend, setDtend] = useState("");

  useEffect(() => {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t) setToken(t);
  }, []);

  const icsUrl = useMemo(() => {
    if (!token || typeof window === "undefined") return "";
    return `${window.location.origin}/api/calendario_marisol/calendar.ics?token=${encodeURIComponent(token)}`;
  }, [token]);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calendario_marisol/eventos", {
        headers: authHeaders(t),
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar");
      setEventos(data.eventos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setEventos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  function login(e: React.FormEvent) {
    e.preventDefault();
    const t = tokenInput.trim();
    if (!t) return;
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setEventos([]);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const res = await fetch("/api/calendario_marisol/eventos", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          summary,
          description,
          dtstart: fromLocalInput(dtstart),
          dtend: fromLocalInput(dtend),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear");
      setSummary("");
      setDescription("");
      setDtstart("");
      setDtend("");
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function borrar(id: string) {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(`/api/calendario_marisol/eventos/${id}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al borrar");
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function copiarIcs() {
    if (!icsUrl) return;
    try {
      await navigator.clipboard.writeText(icsUrl);
    } catch {
      setError("No se pudo copiar la URL");
    }
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8 text-zinc-100">
        <h1 className="text-xl font-semibold tracking-tight">Calendario Marisol</h1>
        <p className="text-sm text-zinc-400">Token de acceso</p>
        <form onSubmit={login} className="flex flex-col gap-3">
          <input
            type="password"
            autoComplete="off"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            placeholder="CALENDARIO_MARISOL_TOKEN"
          />
          <button
            type="submit"
            className="rounded bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900"
          >
            Entrar
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8 text-zinc-100">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Calendario Marisol</h1>
          <p className="text-sm text-zinc-400">Hermes + Skylight</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-sm text-zinc-400 underline-offset-2 hover:underline"
        >
          Salir
        </button>
      </header>

      <section className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-zinc-500">URL ICS (Skylight)</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={icsUrl}
            className="min-w-0 flex-1 truncate rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={copiarIcs}
            className="shrink-0 rounded border border-zinc-600 px-3 py-2 text-sm"
          >
            Copiar
          </button>
        </div>
      </section>

      <form onSubmit={crear} className="flex flex-col gap-3 border-t border-zinc-800 pt-6">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Nuevo evento</p>
        <input
          required
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Título"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        />
        <label className="text-xs text-zinc-500">
          Inicio
          <input
            required
            type="datetime-local"
            value={dtstart}
            onChange={(e) => setDtstart(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Fin
          <input
            required
            type="datetime-local"
            value={dtend}
            onChange={(e) => setDtend(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900"
        >
          Agregar
        </button>
      </form>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-500">Cargando…</p> : null}

      <ul className="flex flex-col gap-3 border-t border-zinc-800 pt-6">
        {eventos.length === 0 && !loading ? (
          <li className="text-sm text-zinc-500">Sin eventos</li>
        ) : null}
        {eventos.map((ev) => (
          <li
            key={ev.id}
            className="flex items-start justify-between gap-3 border-b border-zinc-800/80 pb-3"
          >
            <div className="min-w-0">
              <p className="font-medium">{ev.summary}</p>
              {ev.description ? (
                <p className="text-sm text-zinc-400">{ev.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-zinc-500">
                {toLocalInput(ev.dtstart).replace("T", " ")} →{" "}
                {toLocalInput(ev.dtend).replace("T", " ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void borrar(ev.id)}
              className="shrink-0 text-sm text-red-400"
            >
              Borrar
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
