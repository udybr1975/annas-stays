import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { bookingId, postUrl } = req.body;

  if (!bookingId || !postUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (typeof postUrl !== 'string' || !postUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'postUrl must start with https://' });
  }

  // 1. Verify booking exists and is confirmed
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, status, total_price, guest_id')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  if (booking.status !== 'confirmed') {
    return res.status(400).json({ error: 'Booking must be confirmed to request a UGC refund' });
  }

  // 2. Check for existing non-rejected submission
  const { data: existing } = await supabase
    .from('ugc_submissions')
    .select('id')
    .eq('booking_id', bookingId)
    .neq('status', 'rejected')
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: 'A refund request already exists for this booking' });
  }

  // 3. Calculate refund: min(total_price * 0.1, 30), rounded to 2 decimal places
  const refundAmount = Math.round(Math.min(booking.total_price * 0.1, 30) * 100) / 100;

  // 4. Insert ugc_submissions row
  const { data: submission, error: insertError } = await supabase
    .from('ugc_submissions')
    .insert({
      booking_id: bookingId,
      guest_id: booking.guest_id || null,
      post_url: postUrl,
      screenshot_url: null,
      status: 'pending',
      refund_amount: refundAmount,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[request-ugc-refund] insert error:', insertError.message);
    return res.status(500).json({ error: 'Failed to save submission: ' + insertError.message });
  }

  // 5. Send ntfy to Anna
  try {
    await fetch(process.env.NTFY_URL!, {
      method: 'POST',
      body: 'New Instagram refund request — booking ' + bookingId + ' — EUR ' + refundAmount.toFixed(2),
      headers: {
        'Title': 'UGC Refund Request',
        'Priority': 'default',
        'Content-Type': 'text/plain',
      },
    });
  } catch (ntfyErr) {
    console.error('[request-ugc-refund] ntfy failed (non-critical):', ntfyErr);
  }

  return res.status(200).json({
    success: true,
    submissionId: submission.id,
    refundAmount,
  });
}
