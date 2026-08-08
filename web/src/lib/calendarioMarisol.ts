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

// ponytail: personal calendar; token hardcoded on purpose
const CALENDARIO_TOKEN =
  "15c903ed719abb5f3eb16e102300a0ed692fe8305319c293";

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

function isAllDayEvent(dtstart: string, dtend: string): boolean {
  const s = new Date(dtstart);
  const e = new Date(dtend);
  const dur = e.getTime() - s.getTime();
  return dur >= 23 * 60 * 60 * 1000;
}

async function pushEventoToSkylight(row: Record<string, unknown>): Promise<string | null> {
  try {
    const dtstart = new Date(String(row.dtstart)).toISOString();
    const dtend = new Date(String(row.dtend)).toISOString();
    const id = await createSkylightCalendarEvent({
      summary: String(row.summary),
      description: String(row.description ?? ""),
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
  const payload = {
    summary: String(patch.summary ?? full.summary),
    description: String(patch.description ?? full.description ?? ""),
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

async function syncEventoDeleteFromSkylight(skylightId: string | null): Promise<void> {
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
    description: String(row.description ?? ""),
    dtstart: new Date(String(row.dtstart)).toISOString(),
    dtend: new Date(String(row.dtend)).toISOString(),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listEventos(): Promise<CalendarioEvento[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, uid, summary, description, dtstart, dtend, created_at, updated_at")
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
    .select("id, uid, summary, description, dtstart, dtend, created_at, updated_at, skylight_event_id")
    .single();
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  const skylightId = await pushEventoToSkylight(row);
  if (skylightId) {
    await supabase
      .from(TABLE)
      .update({ skylight_event_id: skylightId })
      .eq("id", row.id);
  }
  return rowToEvento(row);
}

export async function updateEvento(
  id: string,
  body: EventoInput,
): Promise<CalendarioEvento | null> {
  const patch = parsePatch(body);
  const { data: prev } = await supabase
    .from(TABLE)
    .select("id, uid, summary, description, dtstart, dtend, skylight_event_id")
    .eq("id", id)
    .maybeSingle();
  if (!prev) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, uid, summary, description, dtstart, dtend, created_at, updated_at, skylight_event_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const prevRow = prev as Record<string, unknown>;
  const skylightId = await syncEventoUpdateToSkylight(
    prevRow.skylight_event_id ? String(prevRow.skylight_event_id) : null,
    patch,
    row,
  );
  if (skylightId && skylightId !== String(prevRow.skylight_event_id ?? "")) {
    await supabase
      .from(TABLE)
      .update({ skylight_event_id: skylightId })
      .eq("id", id);
  }
  return rowToEvento(row);
}

export async function deleteEvento(id: string): Promise<boolean> {
  const { data: prev } = await supabase
    .from(TABLE)
    .select("id, skylight_event_id")
    .eq("id", id)
    .maybeSingle();
  if (!prev) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;

  const skylightId = (prev as Record<string, unknown>).skylight_event_id;
  await syncEventoDeleteFromSkylight(
    skylightId ? String(skylightId) : null,
  );
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
