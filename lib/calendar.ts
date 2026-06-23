import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface VillaBooking {
  villaName: string;
  checkIn: string;
  checkOut: string;
  bookingStatus: string;
}

interface Cache {
  data: VillaBooking[];
  expiresAt: number;
}

const TTL_MS = 60_000;

let cache: Cache | null = null;
let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return supabase;
}

export async function getBookings(): Promise<VillaBooking[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await getSupabaseClient()
      .from("bookings")
      .select("check_in, check_out, booking_status, villas(name)")
      .gte("check_out", today)
      .not("booking_status", "ilike", "cancel%")
      .order("check_in", { ascending: true });

    if (error) throw error;

    const bookings: VillaBooking[] = (data ?? []).map((row) => ({
      villaName: (row.villas as unknown as { name: string } | null)?.name ?? "ไม่ทราบ",
      checkIn: row.check_in,
      checkOut: row.check_out,
      bookingStatus: row.booking_status,
    }));

    cache = { data: bookings, expiresAt: Date.now() + TTL_MS };
    return bookings;
  } catch (err) {
    console.error("[CALENDAR_ERROR]", err);
    if (cache) {
      return cache.data;
    }
    return [];
  }
}

export function bookingsToText(bookings: VillaBooking[]): string {
  if (bookings.length === 0) {
    return "ไม่มีข้อมูลการจองที่กำลังจะถึง วิลล่าทุกหลังว่างทุกวัน";
  }

  return bookings
    .map((b) => `${b.villaName}: ไม่ว่างตั้งแต่ ${b.checkIn} ถึง ${b.checkOut} (สถานะ: ${b.bookingStatus})`)
    .join("\n");
}
