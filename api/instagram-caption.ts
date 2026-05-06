import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey || !geminiKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { bookingId } = req.body;

  if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, apartments(name, neighborhood), guests(*)')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const guestData = booking.guests;
  const guest = Array.isArray(guestData) ? guestData[0] : guestData;
  const apartment = booking.apartments as any;
  const guestFirstName = guest?.first_name || 'Guest';
  const apartmentName = apartment?.name || 'the apartment';
  const neighbourhood = apartment?.neighborhood || 'Helsinki';
  const checkIn = booking.check_in || '';

  const prompt = `Write an authentic first-person Instagram caption for ${guestFirstName}, a guest who just stayed at "${apartmentName}" in ${neighbourhood}, Helsinki (check-in: ${checkIn}).
Requirements:
- Sound like a real traveler writing to their followers, not a marketing message
- Warm, personal, and genuine — mention a specific detail about the stay
- Under 150 words total
- The second-to-last line must be: @annas_stays
- The very last line must be exactly: #Helsinki #Finland #VisitFinland #HelsinkiLife #BoutiqueStay #TravelScandinavia
Return only the caption text, nothing else.`;

  let caption = '';
  let lastError = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (!response.ok) {
        lastError = `Gemini HTTP ${response.status}`;
        console.error(`[instagram-caption] attempt ${attempt} failed: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      caption = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      if (caption) break;
      lastError = 'Empty response from Gemini';
    } catch (err: any) {
      lastError = err.message;
      console.error(`[instagram-caption] attempt ${attempt} threw:`, err.message);
    }
  }

  if (!caption) {
    return res.status(500).json({ error: 'Failed to generate caption: ' + lastError });
  }

  return res.status(200).json({ caption });
}
