import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { bookingId, email } = req.body;
  if (!bookingId || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, guests(*), apartments(name)')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.status === 'cancelled' || booking.status === 'declined') {
    return res.status(404).json({ error: 'This reservation is no longer accessible.' });
  }

  let guest = Array.isArray(booking.guests) ? booking.guests[0] : booking.guests;

  if (!guest?.email && booking.guest_id) {
    const { data: directGuest } = await supabase
      .from('guests')
      .select('*')
      .eq('id', booking.guest_id)
      .single();
    if (directGuest) guest = directGuest;
  }

  const storedEmail = (guest?.email || '').toLowerCase().trim();
  const providedEmail = email.toLowerCase().trim();

  if (!storedEmail || storedEmail !== providedEmail) {
    return res.status(401).json({
      error: 'Email does not match this reservation.',
      referenceNumber: booking.reference_number,
    });
  }

  return res.status(200).json({
    valid: true,
    booking: { ...booking, guests: guest ? [guest] : [] },
    guest,
  });
}
