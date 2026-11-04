import "server-only";
import { and, eq, gte, lt } from "drizzle-orm";
import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { db, schema } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { astToUtc, TZ } from "@/lib/time";
import { normalizeTtPhone } from "@/lib/phone";
import { logAudit } from "@/lib/audit";
import { enqueueJob } from "@/lib/jobs";
import { createLead, moveStage } from "@/lib/leads/service";
import type { WeeklyAvailability } from "@/lib/db/schema";

export const SLOT_MINUTES = 20;
const MIN_NOTICE_MINUTES = 120;

/** Pure: 20-minute slots from weekly AST availability, minus taken slots and anything too soon. */
export function computeSlots(availability: WeeklyAvailability, taken: Date[], now: Date, days = 14): Date[] {
  const takenSet = new Set(taken.map((d) => d.getTime()));
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const day = formatInTimeZone(addDays(now, i), TZ, "yyyy-MM-dd");
    const weekday = formatInTimeZone(astToUtc(`${day}T12:00:00`), TZ, "i"); // ISO 1=Mon..7=Sun
    const key = weekday === "7" ? "0" : weekday;
    for (const w of availability[key] ?? []) {
      let t = astToUtc(`${day}T${w.start}:00`);
      const end = astToUtc(`${day}T${w.end}:00`);
      while (addMinutes(t, SLOT_MINUTES) <= end) {
        if (t.getTime() >= now.getTime() + MIN_NOTICE_MINUTES * 60_000 && !takenSet.has(t.getTime())) out.push(t);
        t = addMinutes(t, SLOT_MINUTES);
      }
    }
  }
  return out;
}

export async function availableSlots(now = new Date(), days = 14) {
  const settings = await getSettings();
  const taken = await db
    .select({ startsAt: schema.bookings.startsAt })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.status, "booked"), gte(schema.bookings.startsAt, now), lt(schema.bookings.startsAt, addDays(now, days + 1))));
  const slots = computeSlots(settings.availability, taken.map((t) => t.startsAt), now, days);
  // Google Calendar on: also hide anything that clashes with Matthias's own calendar.
  const { googleReady, busyTimes } = await import("@/lib/google");
  if (!(await googleReady("google_calendar"))) return slots;
  try {
    const { filterBusy } = await import("@/lib/google/mime");
    return filterBusy(slots, await busyTimes(now, addDays(now, days + 1)), SLOT_MINUTES);
  } catch (e) {
    const { raiseAlert } = await import("@/lib/alerts");
    await raiseAlert({ kind: "integration", severity: "warning", title: "Google Calendar busy times unavailable", body: e instanceof Error ? e.message : String(e), dedupeKey: `gcal_busy:${now.toISOString().slice(0, 13)}` });
    return slots;
  }
}

export type BookingInput = { name: string; businessName: string; phone: string; email?: string | null; notes?: string | null; startsAt: Date };

/** Public booking: validates the slot, links or creates the lead, moves it to Call booked and queues the call brief. */
export async function createBooking(input: BookingInput, ip: string | null) {
  const slots = await availableSlots();
  if (!slots.some((s) => s.getTime() === input.startsAt.getTime())) throw new Error("That time is no longer available. Please pick another.");
  const phone = normalizeTtPhone(input.phone);
  if (!phone) throw new Error("Please enter a valid phone number.");

  let [lead] = await db.select().from(schema.leads).where(eq(schema.leads.phoneNormalized, phone));
  if (!lead && input.email) [lead] = await db.select().from(schema.leads).where(eq(schema.leads.email, input.email.toLowerCase()));
  if (!lead) {
    const r = await createLead({ businessName: input.businessName, contactName: input.name, phone, email: input.email, source: "booking_page" }, { type: "portal" });
    lead = r.lead;
  }

  const inserted = await db
    .insert(schema.bookings)
    .values({
      leadId: lead.id,
      name: input.name,
      businessName: input.businessName,
      phone,
      email: input.email?.toLowerCase() || null,
      notes: input.notes || null,
      startsAt: input.startsAt,
      endsAt: addMinutes(input.startsAt, SLOT_MINUTES),
      source: "book_page",
    })
    .onConflictDoNothing()
    .returning();
  const booking = inserted[0];
  if (!booking) throw new Error("That time was just taken. Please pick another.");

  await db.insert(schema.activities).values({ leadId: lead.id, type: "call", body: `Call booked via /book for ${formatInTimeZone(input.startsAt, TZ, "EEE d MMM, h:mm a")} AST${input.notes ? ` — “${input.notes}”` : ""}`, metadata: { bookingId: booking.id } });
  if (!["won", "lost", "call_booked", "proposal_sent"].includes(lead.stage)) await moveStage(lead.id, "call_booked", null);
  await db.update(schema.leads).set({ nextAction: "Discovery call", nextActionDue: input.startsAt }).where(eq(schema.leads.id, lead.id));
  await enqueueJob("call_brief", { leadId: lead.id, bookingId: booking.id }, { dedupeKey: `call_brief:${booking.id}` });
  await logAudit({ actorType: "portal", action: "booking.created", entityTable: "bookings", entityId: booking.id, details: { leadId: lead.id }, ip });
  // Google Calendar on: add the call to Matthias's calendar. A calendar error never loses the booking.
  const { googleReady, createCalendarEvent } = await import("@/lib/google");
  if (await googleReady("google_calendar")) {
    try {
      await createCalendarEvent(booking.id);
    } catch (e) {
      const { raiseAlert } = await import("@/lib/alerts");
      await raiseAlert({ kind: "integration", severity: "warning", title: "Couldn't add a booked call to Google Calendar", body: e instanceof Error ? e.message : String(e), link: `/dashboard/leads/${lead.id}`, dedupeKey: `gcal_event:${booking.id}` });
    }
  }
  return booking;
}
