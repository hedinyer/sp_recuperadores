import { randomUUID, timingSafeEqual } from "crypto";

import { supabase } from "@/lib/supabase";
import {
  createSkylightCalendarEvent,
  deleteSkylightCalendarEvent,
  updateSkylightCalendarEvent,
} from "@/lib/skylightClient";

export type CalendarioEvento = {
  id: string;
  uid: string;
  summary: string;
  description: string;
  dtstart: string;
  dtend: string;
  created_at: string;
  updated_at: string;
};

type EventoInput = {
  summary?: unknown;
  description?: unknown;
  dtstart?: unknown;
  dtend?: unknown;
  uid?: unknown;
};

const TABLE = "calendario_marisol_eventos";
const EVENT_COLS =
  "id, uid, summary, description, dtstart, dtend, created_at, updated_at" as const;
/** Fallback si la columna skylight_event_id aún no existe en prod. */
const SKY_MARKER_RE = /\n?\[skylight:([^\]]+)\]\s*$/;

// ponytail: personal calendar; token hardcoded on purpose
const CALENDARIO_TOKEN =
  "15c903ed719abb5f3eb16e102300a0ed692fe8305319c293";

/** null = desconocido; se detecta en runtime contra Supabase. */
let skyColumnAvailable: boolean | null = null;

function expectedToken(): string {
  return CALENDARIO_TOKEN;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Bearer o ?token= (Skylight solo entiende URL). */
export function calendarioTokenOk(request: Request): boolean {
  const expected = expectedToken();
  if (!expected) return false;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (bearer && safeEqual(bearer, expected)) return true;

  const url = new URL(request.url);
  const q = url.searchParams.get("token")?.trim() ?? "";
  return Boolean(q && safeEqual(q, expected));
}

export function calendarioTokenConfigured(): boolean {
  return true;
}

function asIso(value: unknown, field: string): string {
  const s = String(value ?? "").trim();
  if (!s) throw new Error(`${field} requerido`);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} inválido`);
  return d.toISOString();
}

function parseCreate(body: EventoInput) {
  const summary = String(body.summary ?? "").trim();
  if (!summary) throw new Error("summary requerido");
  const description = String(body.description ?? "").trim();
  const dtstart = asIso(body.dtstart, "dtstart");
  const dtend = asIso(body.dtend, "dtend");
  if (new Date(dtend).getTime() < new Date(dtstart).getTime()) {
    throw new Error("dtend debe ser >= dtstart");
  }
  const uid =
    String(body.uid ?? "").trim() || `${randomUUID()}@calendario-marisol`;
  return { summary, description, dtstart, dtend, uid };
}

function parsePatch(body: EventoInput) {
  const out: Record<string, string> = {};
  if (body.summary !== undefined) {
    const summary = String(body.summary).trim();
    if (!summary) throw new Error("summary vacío");
    out.summary = summary;
  }
  if (body.description !== undefined) {
    out.description = String(body.description).trim();
  }
  if (body.dtstart !== undefined) out.dtstart = asIso(body.dtstart, "dtstart");
  if (body.dtend !== undefined) out.dtend = asIso(body.dtend, "dtend");
  if (Object.keys(out).length === 0) throw new Error("Nada que actualizar");
  return out;
}

function isMissingSkyColumnError(message: string | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  return m.includes("skylight_event_id") && m.includes("does not exist");
}

function stripSkyMarker(description: string): {
  description: string;
  skylightId: string | null;
} {
  const m = description.match(SKY_MARKER_RE);
  if (!m) return { description, skylightId: null };
  return {
    description: description.replace(SKY_MARKER_RE, "").trimEnd(),
    skylightId: m[1],
  };
}

function withSkyMarker(description: string, skylightId: string): string {
  const clean = stripSkyMarker(description).description;
  return `${clean}\n[skylight:${skylightId}]`;
}

function readSkylightId(row: Record<string, unknown>): string | null {
  const fromCol = row.skylight_event_id;
  if (fromCol != null && String(fromCol).trim()) return String(fromCol);
  return stripSkyMarker(String(row.description ?? "")).skylightId;
}

async function hasSkyColumn(): Promise<boolean> {
  if (skyColumnAvailable !== null) return skyColumnAvailable;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_ZeTnYMfkIBdQB-jg9gXi2Q_tEQDQwM7";
  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://hvtbzxifzkbvmqpshmqw.supabase.co";
  // Select tipado evitado: la columna puede no existir en el schema de tipos/prod.
  const res = await fetch(
    `${base}/rest/v1/${TABLE}?select=skylight_event_id&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  );
  skyColumnAvailable = res.ok;
  return skyColumnAvailable;
}

async function persistSkylightId(
  id: string,
  skylightId: string,
  description: string,
): Promise<void> {
  if (await hasSkyColumn()) {
    const { error } = await supabase
      .from(TABLE)
      .update({ skylight_event_id: skylightId } as never)
      .eq("id", id);
    if (!error) return;
    if (!isMissingSkyColumnError(error.message)) {
      throw new Error(error.message);
    }
    skyColumnAvailable = false;
  }
  const { error } = await supabase
    .from(TABLE)
    .update({ description: withSkyMarker(description, skylightId) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

function isAllDayEvent(dtstart: string, dtend: string): boolean {
  const s = new Date(dtstart);
  const e = new Date(dtend);
  const dur = e.getTime() - s.getTime();
  return dur >= 23 * 60 * 60 * 1000;
}

async function pushEventoToSkylight(
  row: Record<string, unknown>,
): Promise<string | null> {
  try {
    const dtstart = new Date(String(row.dtstart)).toISOString();
    const dtend = new Date(String(row.dtend)).toISOString();
    const description = stripSkyMarker(String(row.description ?? "")).description;
    const id = await createSkylightCalendarEvent({
      summary: String(row.summary),
      description,
      starts_at: dtstart,
      ends_at: dtend,
      all_day: isAllDayEvent(dtstart, dtend),
    });
    return id;
  } catch {
    return null;
  }
}

async function syncEventoUpdateToSkylight(
  skylightId: string | null,
  patch: Record<string, string>,
  full: Record<string, unknown>,
): Promise<string | null> {
  const rawDescription = String(patch.description ?? full.description ?? "");
  const payload = {
    summary: String(patch.summary ?? full.summary),
    description: stripSkyMarker(rawDescription).description,
    starts_at: new Date(String(patch.dtstart ?? full.dtstart)).toISOString(),
    ends_at: new Date(String(patch.dtend ?? full.dtend)).toISOString(),
    all_day: isAllDayEvent(
      new Date(String(patch.dtstart ?? full.dtstart)).toISOString(),
      new Date(String(patch.dtend ?? full.dtend)).toISOString(),
    ),
  };
  try {
    if (skylightId) {
      await updateSkylightCalendarEvent(skylightId, payload);
      return skylightId;
    }
    return await createSkylightCalendarEvent(payload);
  } catch {
    return skylightId;
  }
}

async function syncEventoDeleteFromSkylight(
  skylightId: string | null,
): Promise<void> {
  if (!skylightId) return;
  try {
    await deleteSkylightCalendarEvent(skylightId);
  } catch {
    /* best-effort */
  }
}

function rowToEvento(row: Record<string, unknown>): CalendarioEvento {
  return {
    id: String(row.id),
    uid: String(row.uid),
    summary: String(row.summary),
    description: stripSkyMarker(String(row.description ?? "")).description,
    dtstart: new Date(String(row.dtstart)).toISOString(),
    dtend: new Date(String(row.dtend)).toISOString(),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listEventos(): Promise<CalendarioEvento[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(EVENT_COLS)
    .order("dtstart", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => rowToEvento(row as Record<string, unknown>));
}

export async function createEvento(
  body: EventoInput,
): Promise<CalendarioEvento> {
  const e = parseCreate(body);
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      uid: e.uid,
      summary: e.summary,
      description: e.description,
      dtstart: e.dtstart,
      dtend: e.dtend,
    })
    .select(EVENT_COLS)
    .single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  const skylightId = await pushEventoToSkylight(row);
  if (skylightId) {
    try {
      await persistSkylightId(String(row.id), skylightId, e.description);
      row.description = withSkyMarker(e.description, skylightId);
      row.skylight_event_id = skylightId;
    } catch {
      /* el evento ya quedó; sync id es best-effort */
    }
  }
  return rowToEvento(row);
}

export async function updateEvento(
  id: string,
  body: EventoInput,
): Promise<CalendarioEvento | null> {
  const patch = parsePatch(body);
  const { data: prev, error: prevErr } = await supabase
    .from(TABLE)
    .select("id, uid, summary, description, dtstart, dtend")
    .eq("id", id)
    .maybeSingle();
  if (prevErr) throw new Error(prevErr.message);
  if (!prev) return null;

  const prevRow = prev as Record<string, unknown>;
  const prevSky = readSkylightId(prevRow);
  const useSky = await hasSkyColumn();

  // Si el cliente parchea description, conservar el marcador interno.
  if (patch.description !== undefined && !useSky && prevSky) {
    patch.description = withSkyMarker(patch.description, prevSky);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(EVENT_COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const skylightId = await syncEventoUpdateToSkylight(prevSky, patch, {
    ...row,
    description: stripSkyMarker(String(row.description ?? "")).description,
  });
  if (skylightId && skylightId !== prevSky) {
    try {
      await persistSkylightId(
        id,
        skylightId,
        stripSkyMarker(String(row.description ?? "")).description,
      );
      row.skylight_event_id = skylightId;
    } catch {
      /* best-effort */
    }
  }
  return rowToEvento(row);
}

export async function deleteEvento(id: string): Promise<boolean> {
  const { data: prev, error: prevErr } = await supabase
    .from(TABLE)
    .select("id, description")
    .eq("id", id)
    .maybeSingle();
  if (prevErr) throw new Error(prevErr.message);
  if (!prev) return false;

  const skylightId = readSkylightId(prev as Record<string, unknown>);

  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;

  await syncEventoDeleteFromSkylight(skylightId);
  return true;
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsDate(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** RFC 5545 mínimo, sin librería. */
export function eventosToIcs(eventos: CalendarioEvento[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendario Marisol//Hermes//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Calendario Marisol",
    "X-WR-TIMEZONE:America/Bogota",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1M",
    "X-PUBLISHED-TTL:PT1M",
  ];
  for (const e of eventos) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(e.uid)}`,
      `DTSTAMP:${icsDate(e.updated_at)}`,
      `DTSTART:${icsDate(e.dtstart)}`,
      `DTEND:${icsDate(e.dtend)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
    );
    if (e.description) {
      lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
