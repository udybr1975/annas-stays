import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function parseDateValue(raw: string): string | null {
  const clean = raw.trim().replace(/[^0-9]/g, "").slice(0, 8);
  if (clean.length !== 8) return null;
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

function parseIcal(text: string): Array<{ checkIn: string; checkOut: string }> {
  const results: Array<{ checkIn: string; checkOut: string }> = [];
  const blocks = text.split("BEGIN:VEVENT");
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const startMatch = block.match(/DTSTART(?:;[^:\r\n]*)?:([^\r\n]+)/);
    const endMatch = block.match(/DTEND(?:;[^:\r\n]*)?:([^\r\n]+)/);
    if (!startMatch || !endMatch) continue;
    const checkIn = parseDateValue(startMatch[1]);
    const checkOut = parseDateValue(endMatch[1]);
    if (checkIn && checkOut) results.push({ checkIn, checkOut });
  }
  return results;
}

async function fetchAndParse(url: string): Promise<{ ok: true; events: Array<{ checkIn: string; checkOut: string }> } | { ok: false; error: string }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: "HTTP " + r.status };
    const text = await r.text();
    return { ok: true, events: parseIcal(text) };
  } catch (err: any) {
    return { ok: false, error: err.message || "Network error" };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { apartmentId, allApartments, testOnly, url: testUrl } = req.body || {};

  // testOnly with a direct URL — validate without touching the database
  if (testOnly && testUrl) {
    const result = await fetchAndParse(testUrl);
    if (!result.ok) return res.status(200).json({ valid: false, error: (result as any).error });
    return res.status(200).json({ valid: true, found: result.events.length });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let ids: string[] = [];

  if (allApartments) {
    const { data, error } = await supabase
      .from("apartments")
      .select("id")
      .not("airbnb_ical_url", "is", null);
    if (error) return res.status(500).json({ error: error.message });
    ids = (data || []).map((r: any) => String(r.id));
  } else if (apartmentId) {
    ids = [String(apartmentId)];
  } else {
    return res.status(400).json({ error: "Missing apartmentId or allApartments" });
  }

  let totalSynced = 0;

  for (const id of ids) {
    const { data: apt, error: aptErr } = await supabase
      .from("apartments")
      .select("airbnb_ical_url")
      .eq("id", id)
      .single();

    if (aptErr || !apt?.airbnb_ical_url) continue;

    const result = await fetchAndParse(apt.airbnb_ical_url);

    if (!result.ok) {
      if (testOnly) return res.status(200).json({ valid: false, error: (result as any).error });
      continue;
    }

    if (testOnly) {
      return res.status(200).json({ valid: true, found: result.events.length });
    }

    await supabase.from("bookings").delete().eq("apartment_id", id).eq("source", "airbnb");

    if (result.events.length > 0) {
      await supabase.from("bookings").insert(
        result.events.map(e => ({
          apartment_id: id,
          check_in: e.checkIn,
          check_out: e.checkOut,
          status: "confirmed",
          source: "airbnb",
          admin_needs_attention: false,
        }))
      );
    }

    totalSynced += result.events.length;
  }

  return res.status(200).json({ synced: totalSynced });
}
