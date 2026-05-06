import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { bookingId, screenshotBase64, screenshotMimeType } = req.body;

  if (!bookingId || !screenshotBase64 || !screenshotMimeType) {
    return res.status(400).json({ error: 'Missing required fields' });
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

  // 3. Upload screenshot to Supabase Storage
  const ext = screenshotMimeType === 'image/png' ? 'png'
    : screenshotMimeType === 'image/webp' ? 'webp'
    : 'jpg';
  const filename = `ugc-${bookingId}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(screenshotBase64, 'base64');

  const { error: uploadError } = await supabase.storage
    .from('ugc-screenshots')
    .upload(filename, buffer, { contentType: screenshotMimeType, upsert: false });

  if (uploadError) {
    console.error('[request-ugc-refund] storage upload error:', uploadError.message);
    return res.status(500).json({ error: 'Failed to upload screenshot: ' + uploadError.message });
  }

  const { data: { publicUrl } } = supabase.storage.from('ugc-screenshots').getPublicUrl(filename);

  // 4. Calculate refund: min(total_price * 0.1, 30), rounded to 2 decimal places
  const refundAmount = Math.round(Math.min(booking.total_price * 0.1, 30) * 100) / 100;

  // 5. Insert ugc_submissions row
  const { data: submission, error: insertError } = await supabase
    .from('ugc_submissions')
    .insert({
      booking_id: bookingId,
      guest_id: booking.guest_id || null,
      screenshot_url: publicUrl,
      status: 'pending',
      refund_amount: refundAmount,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[request-ugc-refund] insert error:', insertError.message);
    return res.status(500).json({ error: 'Failed to save submission: ' + insertError.message });
  }

  // 6. Send ntfy to Anna
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
