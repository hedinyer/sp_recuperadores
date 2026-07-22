/** Self-check ICS — npx tsx src/lib/calendarioMarisol.icscheck.ts */
import { eventosToIcs, type CalendarioEvento } from "./calendarioMarisol.ts";

const sample: CalendarioEvento = {
  id: "00000000-0000-0000-0000-000000000001",
  uid: "test@calendario-marisol",
  summary: "Dentista; mañana",
  description: "Llevar docs\nsegundo renglón",
  dtstart: "2026-07-23T20:00:00.000Z",
  dtend: "2026-07-23T21:00:00.000Z",
  created_at: "2026-07-22T12:00:00.000Z",
  updated_at: "2026-07-22T12:00:00.000Z",
};

const ics = eventosToIcs([sample]);
const checks = [
  ics.includes("BEGIN:VCALENDAR"),
  ics.includes("BEGIN:VEVENT"),
  ics.includes("SUMMARY:Dentista\\; mañana"),
  ics.includes("DESCRIPTION:Llevar docs\\nsegundo renglón"),
  ics.includes("DTSTART:20260723T200000Z"),
  ics.includes("END:VCALENDAR"),
  ics.includes("\r\n"),
];

if (checks.some((c) => !c)) {
  console.error("ICS check failed", checks, ics);
  process.exit(1);
}
console.log("ics ok");
