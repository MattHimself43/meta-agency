"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createBooking } from "@/lib/booking";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  slot: z.string().datetime(),
  name: z.string().trim().min(2).max(100),
  businessName: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
  website: z.string().max(0).optional(), // honeypot: bots fill it, people never see it
});

export async function bookAction(form: FormData) {
  const ip = clientIp(await headers());
  if (!(await rateLimit(`book:${ip}`, 5, 3600)).ok) redirect("/book?error=Too+many+booking+attempts.+Please+try+again+later.");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/book?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Please check the form.")}`);
  let bookingId = "";
  try {
    const b = await createBooking(
      { name: parsed.data.name, businessName: parsed.data.businessName, phone: parsed.data.phone, email: parsed.data.email || null, notes: parsed.data.notes, startsAt: new Date(parsed.data.slot) },
      ip,
    );
    bookingId = b.id;
  } catch (e) {
    redirect(`/book?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not book that time.")}`);
  }
  redirect(`/book?booked=${encodeURIComponent(parsed.data.slot)}&ref=${bookingId.slice(0, 8)}`);
}
