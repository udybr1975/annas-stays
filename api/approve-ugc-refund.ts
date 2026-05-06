import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { emailWrap, bookingTable, annaSignature, annaMessage } from './emailTemplate.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { submissionId } = req.body;
  if (!submissionId) return res.status(400).json({ error: 'Missing submissionId' });

  // 1. Fetch submission and verify status
  const { data: submission, error: submissionError } = await supabase
    .from('ugc_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (submissionError || !submission) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  if (submission.status !== 'pending') {
    return res.status(400).json({ error: 'Submission is not pending' });
  }

  // 2. Fetch booking + guests + apartments
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, guests(*), apartments(name)')
    .eq('id', submission.booking_id)
    .single();

  if (bookingError || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  if (!booking.stripe_payment_intent_id) {
    return res.status(400).json({ error: 'No payment intent found for this booking' });
  }

  const guestData = booking.guests;
  let guest = Array.isArray(guestData) ? guestData[0] : guestData;

  // Fallback: re-query guests table directly if the FK join returned nothing
  if (!guest?.email && booking.guest_id) {
    console.log('[approve-ugc-refund] running fallback guest query for guest_id:', booking.guest_id);
    const { data: directGuest } = await supabase
      .from('guests')
      .select('email, first_name, last_name')
      .eq('id', booking.guest_id)
      .single();
    if (directGuest?.email) guest = directGuest;
  }

  const guestEmail = guest?.email || null;
  const guestFullName = `${guest?.first_name || ''} ${guest?.last_name || ''}`.trim() || 'Guest';
  const apartmentName = (booking.apartments as any)?.name || 'the apartment';
  const refundAmount: number = submission.refund_amount;
  const refundAmountCents = Math.round(refundAmount * 100);

  // 3. Issue Stripe partial refund
  try {
    await stripe.refunds.create({
      payment_intent: booking.stripe_payment_intent_id,
      amount: refundAmountCents,
    });
    console.log('[approve-ugc-refund] Stripe partial refund issued: EUR', refundAmount, 'for booking', submission.booking_id);
  } catch (stripeErr: any) {
    console.error('[approve-ugc-refund] Stripe refund failed:', stripeErr.message);
    return res.status(500).json({ error: 'Stripe refund failed: ' + stripeErr.message });
  }

  // 4. Update submission status
  await supabase
    .from('ugc_submissions')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', submissionId);

  // 5. Send guest confirmation email
  if (resendKey && guestEmail) {
    try {
      const guestHtml = emailWrap(
        '<h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal;margin:0 0 8px;color:#2C2C2A;">Your Instagram refund is on its way.</h1>' +
        '<p style="font-size:13px;color:#7A756E;margin:0 0 28px;font-style:italic;">Thank you for sharing your stay with your followers.</p>' +
        bookingTable([
          ['Apartment',     apartmentName],
          ['Refund Amount', 'EUR ' + refundAmount.toFixed(2)],
          ['Timeline',      '5–10 business days'],
        ]) +
        annaMessage(
          'Thank you so much for posting about your stay and tagging @annas_stays — it truly means the world to me. ' +
          'Your refund of EUR ' + refundAmount.toFixed(2) + ' has been processed and will appear on your original payment method within 5–10 business days.'
        ) +
        annaSignature()
      );

      await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + resendKey,
        },
        body: JSON.stringify({
          from: "Anna's Stays <info@anna-stays.fi>",
          to: [guestEmail],
          subject: "Your Instagram Refund — EUR " + refundAmount.toFixed(2) + " | Anna's Stays",
          html: guestHtml,
        }),
      });
      console.log('[approve-ugc-refund] guest refund email sent to', guestEmail);
    } catch (emailErr) {
      console.error('[approve-ugc-refund] guest email failed (non-critical):', emailErr);
    }
  } else {
    console.warn('[approve-ugc-refund] SKIPPING guest email — resendKey:', !!resendKey, '| guestEmail:', guestEmail);
  }

  // 6. Send ntfy to Anna
  try {
    await fetch(process.env.NTFY_URL!, {
      method: 'POST',
      body: 'UGC refund of EUR ' + refundAmount.toFixed(2) + ' approved for ' + guestFullName + ' (' + apartmentName + ')',
      headers: {
        'Title': 'UGC Refund Approved',
        'Priority': 'default',
        'Content-Type': 'text/plain',
      },
    });
  } catch (ntfyErr) {
    console.error('[approve-ugc-refund] ntfy failed (non-critical):', ntfyErr);
  }

  return res.status(200).json({ success: true, refundAmount });
}
