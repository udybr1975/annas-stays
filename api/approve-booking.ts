import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { emailWrap, manageButton, bookingTable, annaSignature, annaMessage } from './emailTemplate.js';

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

  // 1. Fetch booking + guest from Supabase
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, guests(*), apartments(name)')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.status !== 'pending' && booking.status !== 'awaiting_payment') {
    return res.status(400).json({ error: 'Booking cannot be approved from its current state' });
  }

  const guest = Array.isArray(booking.guests) ? booking.guests[0] : booking.guests;
  if (!guest?.email) {
    return res.status(400).json({ error: 'Guest email not found' });
  }

  console.log('[approve-booking] supabaseUrl set:', !!supabaseUrl, '| stripeKey set:', !!stripeKey, '| bookingId:', bookingId);

  try {
    // 2. Create a Stripe Checkout Session (payment link) that expires in 24 hours
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24 hours from now

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: guest.email,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Anna's Stays — Booking #${booking.reference_number}`,
              description: `${booking.check_in} to ${booking.check_out} · ${booking.guest_count} guest${booking.guest_count > 1 ? 's' : ''}`,
            },
            unit_amount: Math.round(booking.total_price * 100),
          },
          quantity: 1,
        },
      ],
      expires_at: expiresAt,
      success_url: `https://anna-stays.fi/booking-success?ref=${booking.reference_number}&paid=true`,
      cancel_url: `https://anna-stays.fi/find-booking`,
      metadata: {
        bookingId: booking.id,
        referenceNumber: booking.reference_number,
        source: 'approve_booking',
      },
    });

    // 3. Update booking to awaiting_payment and store the payment link + expiry
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'awaiting_payment',
        admin_needs_attention: false,
        stripe_session_id: session.id,
        stripe_payment_link_url: session.url,
        payment_link_expires_at: new Date(expiresAt * 1000).toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Failed to update booking:', updateError);
      return res.status(500).json({ error: 'Failed to update booking status' });
    }

    // 4. Send payment link email to guest
    if (resendKey) {
      try {
        const aptName = (booking.apartments as any)?.name || 'the apartment';
        const manageUrl = 'https://anna-stays.fi/manage-booking/' + booking.id + '?email=' + encodeURIComponent(guest.email);

        const guestHtml = emailWrap(
          '<h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal;margin:0 0 8px;color:#2C2C2A;">Your request is approved.</h1>' +
          '<p style="font-size:13px;color:#7A756E;margin:0 0 28px;font-style:italic;">Complete your payment within 24 hours to confirm your stay.</p>' +
          bookingTable([
            ['Reference',  '#' + booking.reference_number],
            ['Apartment',  aptName],
            ['Check-in',   booking.check_in],
            ['Check-out',  booking.check_out],
            ['Guests',     String(booking.guest_count)],
            ['Total',      'EUR ' + booking.total_price],
          ]) +
          annaMessage('I am so pleased to welcome you. Complete your payment to secure your dates — I cannot wait to host you in Helsinki.') +
          '<div style="text-align:center;margin:36px 0 12px;">' +
          '<a href="' + session.url + '" style="display:inline-block;padding:14px 36px;background:#3D4F3E;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;">' +
          'Complete Payment &rarr;' +
          '</a>' +
          '</div>' +
          '<p style="text-align:center;font-size:11px;color:#7A756E;margin:8px 0 28px;">' +
          'This link expires in 24 hours. &nbsp; <a href="' + session.url + '" style="color:#5C7A5C;text-decoration:underline;">Button not working? Click here.</a>' +
          '</p>' +
          manageButton(manageUrl) +
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
            to: [guest.email],
            subject: 'Your Request is Approved — Complete Payment | Anna\'s Stays',
            html: guestHtml,
          }),
        });
        console.log('Payment link email sent to ' + guest.email);

        // Notification email to Anna
        await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
          body: JSON.stringify({
            from: "Anna's Stays <info@anna-stays.fi>",
            to: ['info@anna-stays.fi'],
            subject: 'Booking Approved — Awaiting Payment | #' + booking.reference_number + ' | Anna\'s Stays',
            html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">Booking Approved — Payment Link Sent</h2><p><strong>Guest:</strong> ' + (guest.first_name || '') + ' ' + (guest.last_name || '') + '</p><p><strong>Email:</strong> <a href="mailto:' + guest.email + '">' + guest.email + '</a></p><p><strong>Reference:</strong> #' + booking.reference_number + '</p><p><strong>Check-in:</strong> ' + booking.check_in + '</p><p><strong>Check-out:</strong> ' + booking.check_out + '</p><p><strong>Total:</strong> EUR ' + booking.total_price + '</p><p><strong>Payment link expires:</strong> ' + new Date(expiresAt * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '</p></div>',
          }),
        });
        console.log('Notification email sent to info@anna-stays.fi');
      } catch (emailErr) {
        console.error('Email failed (non-critical):', emailErr);
      }
    }

    // 5. Send ntfy notification
    try {
      await fetch(process.env.NTFY_URL!, {
        method: 'POST',
        body: 'Approved and payment link sent to ' + guest.first_name + ' ' + guest.last_name + ' | ' + booking.reference_number + ' | EUR ' + booking.total_price,
        headers: {
          'Title': 'Booking Approved - Awaiting Payment',
          'Priority': 'default',
          'Content-Type': 'text/plain',
        },
      });
    } catch (ntfyErr) {
      console.error('ntfy failed (non-critical):', ntfyErr);
    }

    return res.status(200).json({ success: true, paymentUrl: session.url });

  } catch (err: any) {
    console.error('[approve-booking] FATAL:', err?.message, '| stack:', err?.stack);
    return res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
