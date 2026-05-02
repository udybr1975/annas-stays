import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { emailWrap, bookingTable, annaSignature, annaMessage } from './emailTemplate.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { bookingId } = req.body;

  if (!bookingId) return res.status(400).json({ error: 'Missing bookingId' });

  // 1. Fetch booking and guest from Supabase
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, guests(*), apartments(name)')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking is already cancelled' });
  }

  // Extract guest data from DB
  const guestData = booking.guests;
  const guest = Array.isArray(guestData) ? guestData[0] : guestData;
  let guestEmail = guest?.email || null;
  let guestFirstName = guest?.first_name || 'Guest';
  let guestFullName = `${guest?.first_name || ''} ${guest?.last_name || ''}`.trim() || 'A guest';
  console.log('[cancel-booking] FK join result — guestData:', JSON.stringify(guestData), '| guestEmail after join:', guestEmail);

  // Fallback: re-query guests table directly if the FK join returned nothing
  if (!guestEmail && booking.guest_id) {
    console.log('[cancel-booking] guestEmail null after join — running fallback query for guest_id:', booking.guest_id);
    const { data: directGuest, error: directGuestError } = await supabase
      .from('guests')
      .select('email, first_name, last_name')
      .eq('id', booking.guest_id)
      .single();
    console.log('[cancel-booking] fallback query result — directGuest:', JSON.stringify(directGuest), '| error:', directGuestError?.message ?? null);
    if (directGuest?.email) {
      guestEmail = directGuest.email;
      guestFirstName = directGuest.first_name || 'Guest';
      guestFullName = `${directGuest.first_name || ''} ${directGuest.last_name || ''}`.trim() || 'A guest';
    }
  }
  console.log('[cancel-booking] final guestEmail before email block:', guestEmail, '| resendKey set:', !!resendKey);
  const referenceNumber = booking.reference_number || booking.id?.slice(0, 8) || '';
  const apartmentName = (booking.apartments as any)?.name || 'the apartment';

  // 2. Update booking status to cancelled
const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      admin_needs_attention: false,
    })
    .eq('id', bookingId);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to cancel booking: ' + updateError.message });
  }

  // 3. Issue Stripe refund if a payment intent exists
  let refundIssued = false;
  let refundError = null;

  if (booking.stripe_payment_intent_id) {
    try {
      await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
      });
      refundIssued = true;
      console.log('Refund issued for booking ' + referenceNumber);
    } catch (stripeErr: any) {
      refundError = stripeErr.message;
      console.error('Stripe refund failed for ' + referenceNumber + ':', stripeErr.message);
    }
  } else {
    console.log('No payment intent found for booking ' + referenceNumber + ' — no refund issued');
  }

  // 4. Send cancellation email to guest
  if (resendKey && guestEmail) {
    console.log('[cancel-booking] sending cancellation email to guest:', guestEmail);
    try {
      const refundBlock = refundIssued
        ? '<div style="margin:20px 0;padding:16px 20px;border:1px solid #E8E3DC;background:#F7F4EF;">' +
          '<p style="font-size:12px;color:#2C2C2A;margin:0;line-height:1.6;">' +
          '<span style="font-family:Georgia,serif;">Refund</span> &mdash; ' +
          'A full refund of EUR ' + booking.total_price + ' has been issued to your original payment method. ' +
          'Please allow 5&ndash;10 business days.' +
          '</p></div>'
        : '';

      const guestHtml = emailWrap(
        '<h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal;margin:0 0 8px;color:#2C2C2A;">Your reservation has been cancelled.</h1>' +
        '<p style="font-size:13px;color:#7A756E;margin:0 0 28px;font-style:italic;">We\'re sorry to see you go.</p>' +
        bookingTable([
          ['Reference',  '#' + referenceNumber],
          ['Apartment',  apartmentName],
          ['Check-in',   booking.check_in],
          ['Check-out',  booking.check_out],
          ['Guests',     String(booking.guest_count)],
        ]) +
        refundBlock +
        annaMessage('I was so looking forward to hosting you. I completely understand that plans change, and I hope we will have the chance to meet in Helsinki on another occasion.') +
        '<div style="text-align:center;margin:36px 0 8px;">' +
        '<a href="https://anna-stays.fi" style="display:inline-block;padding:13px 30px;border:1.5px solid #3D4F3E;color:#3D4F3E;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;">' +
        'Browse Availability &rarr;' +
        '</a></div>' +
        annaSignature()
      );

      const guestEmailRes = await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + resendKey,
        },
        body: JSON.stringify({
          from: "Anna's Stays <info@anna-stays.fi>",
          to: [guestEmail],
          subject: 'Reservation Cancelled — #' + referenceNumber + ' | Anna\'s Stays',
          html: guestHtml,
        }),
      });
      const guestEmailData = await guestEmailRes.json().catch(() => null);
      if (guestEmailRes.ok) {
        console.log('[cancel-booking] guest cancellation email OK — Resend id:', guestEmailData?.id);
      } else {
        console.error('[cancel-booking] guest cancellation email REJECTED by Resend — status:', guestEmailRes.status, '| body:', JSON.stringify(guestEmailData));
      }
    } catch (emailErr) {
      console.error('[cancel-booking] guest cancellation email THREW:', emailErr);
    }
  } else {
    console.warn('[cancel-booking] SKIPPING guest email — resendKey:', !!resendKey, '| guestEmail:', guestEmail);
  }

  // 5. Send host notification email
  if (resendKey) {
    try {
      await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
        body: JSON.stringify({
          from: "Anna's Stays <info@anna-stays.fi>",
          to: ['info@anna-stays.fi'],
          subject: 'Booking Cancelled — #' + referenceNumber + ' | Anna\'s Stays',
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">Booking Cancelled</h2><p><strong>Guest:</strong> ' + guestFullName + '</p><p><strong>Email:</strong> ' + (guestEmail || 'N/A') + '</p><p><strong>Reference:</strong> #' + referenceNumber + '</p><p><strong>Apartment:</strong> ' + apartmentName + '</p><p><strong>Check-in:</strong> ' + booking.check_in + '</p><p><strong>Check-out:</strong> ' + booking.check_out + '</p><p><strong>Total:</strong> EUR ' + booking.total_price + '</p>' + (refundIssued ? '<p><strong>Refund:</strong> EUR ' + booking.total_price + ' issued automatically via Stripe</p>' : '<p><strong>Refund:</strong> No payment found — no refund issued</p>') + '</div>',
        }),
      });
      console.log('Host notification sent to info@anna-stays.fi');
    } catch (hostEmailErr) {
      console.error('Host notification email failed (non-critical):', hostEmailErr);
    }
  }

  // 6. Send ntfy to Anna
  try {
    await fetch(process.env.NTFY_URL!, {
      method: 'POST',
      body: guestFullName + ' cancelled booking ' + referenceNumber + ' at ' + apartmentName + (refundIssued ? ' — EUR ' + booking.total_price + ' refunded via Stripe' : ' — no payment found, no refund issued'),
      headers: {
        'Title': 'Booking Cancelled',
        'Priority': 'default',
        'Content-Type': 'text/plain',
      },
    });
  } catch (ntfyErr) {
    console.error('ntfy failed (non-critical):', ntfyErr);
  }

  return res.status(200).json({
    success: true,
    refundIssued,
    refundError: refundError || null,
  });
}
