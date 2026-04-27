import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error('Webhook: Missing env vars');
    return res.status(500).send('Server configuration error');
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig!, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: true });
  }

  const session = event.data.object as any;
  const m = session.metadata;

  // ── PATH A: Payment link completion (guest paying after approval) ──────────
  if (m?.source === 'approve_booking' && m?.bookingId) {
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*, guests(*)')
      .eq('id', m.bookingId)
      .single();

    if (fetchError || !booking) {
      console.error('Webhook: Could not find booking for payment link completion', m.bookingId);
      return res.status(400).send('Booking not found');
    }

    // Idempotency check
    if (booking.status === 'confirmed') {
      console.log('Webhook: Booking already confirmed, skipping');
      return res.status(200).json({ received: true, duplicate: true });
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        admin_needs_attention: true,
        stripe_payment_intent_id: session.payment_intent || null,
      })
      .eq('id', m.bookingId);

    if (updateError) {
      console.error('Webhook: Failed to confirm booking:', updateError.message);
      return res.status(500).send('Failed to confirm booking');
    }

    console.log('Webhook: Booking ' + booking.reference_number + ' confirmed via payment link');

    const guest = Array.isArray(booking.guests) ? booking.guests[0] : booking.guests;

    // Send confirmation email
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && guest?.email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + resendKey,
          },
          body: JSON.stringify({
            from: "Anna's Stays <info@anna-stays.fi>",
            to: [guest.email],
            subject: 'Booking Confirmed — #' + booking.reference_number + ' | Anna\'s Stays',
            html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">Booking Confirmed</h2><p>Dear ' + (guest.first_name || 'Guest') + ',</p><p>Your payment has been received and your stay at <strong>' + (booking.apartment_name || 'the apartment') + '</strong> is confirmed.</p><p><strong>Reference:</strong> #' + booking.reference_number + '</p><p><strong>Check-in:</strong> ' + booking.check_in + '</p><p><strong>Check-out:</strong> ' + booking.check_out + '</p><p><strong>Guests:</strong> ' + booking.guest_count + '</p><p><strong>Total Paid:</strong> EUR ' + booking.total_price + '</p><p>We will send your entry codes 24 hours before check-in.</p><p style="font-style:italic;color:#5C7A5C;">- Anna Humalainen, Host</p></div>',
          }),
        });
        console.log('Confirmation email sent to ' + guest.email);
      } catch (emailErr) {
        console.error('Email failed:', emailErr);
      }
    }

    // Send ntfy
    try {
      await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
        method: 'POST',
        body: 'Payment received: ' + (guest?.first_name || '') + ' ' + (guest?.last_name || '') + ' | ' + booking.reference_number + ' | EUR ' + booking.total_price,
        headers: {
          'Title': 'Booking Confirmed — Payment Received',
          'Priority': 'high',
          'Content-Type': 'text/plain',
        },
      });
    } catch (ntfyErr) {
      console.error('ntfy failed:', ntfyErr);
    }

    return res.status(200).json({ received: true });
  }

  // ── PATH B: Instant book (original flow, unchanged) ────────────────────────
  if (!m || !m.referenceNumber || !m.apartmentId || !m.guestEmail) {
    console.error('Webhook: Missing metadata');
    return res.status(400).send('Missing metadata');
  }

  // Only process instant bookings here — pending no longer goes through Stripe at booking time
  if (m.isInstant !== 'true') {
    console.log('Webhook: Non-instant booking received without approve_booking source — ignoring');
    return res.status(200).json({ received: true, ignored: true });
  }

  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('reference_number', m.referenceNumber)
    .maybeSingle();

  if (existing) {
    console.log('Webhook: ' + m.referenceNumber + ' already exists - skipping');
    return res.status(200).json({ received: true, duplicate: true });
  }

  // Upsert guest
  const { data: guestData, error: guestError } = await supabase
    .from('guests')
    .upsert({
      email: m.guestEmail.toLowerCase().trim(),
      first_name: m.guestFirstName || '',
      last_name: m.guestLastName || '',
    }, {
      onConflict: 'email',
      ignoreDuplicates: false,
    })
    .select('id')
    .single();

  if (guestError || !guestData?.id) {
    console.error('Webhook: Failed to save guest:', guestError?.message);
    return res.status(500).send('Failed to save guest');
  }

  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      apartment_id: m.apartmentId,
      guest_id: guestData.id,
      check_in: m.checkIn,
      check_out: m.checkOut,
      total_price: parseFloat(m.totalPrice),
      guest_count: parseInt(m.guestCount, 10),
      status: 'confirmed',
      reference_number: m.referenceNumber,
      stripe_session_id: session.id,
      admin_needs_attention: true,
      notes: m.message || null,
    })
    .select('id')
    .single();

  if (bookingError || !bookingData?.id) {
    console.error('Webhook: Failed to save booking:', bookingError?.message);
    return res.status(500).send('Failed to save booking');
  }

  console.log('Webhook: Instant booking ' + m.referenceNumber + ' confirmed');

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + resendKey,
        },
        body: JSON.stringify({
          from: "Anna's Stays <info@anna-stays.fi>",
          to: [m.guestEmail],
          subject: 'Booking Confirmed — #' + m.referenceNumber + ' | Anna\'s Stays',
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">Booking Confirmed</h2><p>Dear ' + m.guestFirstName + ',</p><p>Your payment has been received and your stay at <strong>' + m.apartmentName + '</strong> is confirmed.</p><p><strong>Reference:</strong> #' + m.referenceNumber + '</p><p><strong>Check-in:</strong> ' + m.checkIn + '</p><p><strong>Check-out:</strong> ' + m.checkOut + '</p><p><strong>Guests:</strong> ' + m.guestCount + '</p><p><strong>Total Paid:</strong> EUR ' + m.totalPrice + '</p><p>We will send your entry codes 24 hours before check-in.</p><p style="font-style:italic;color:#5C7A5C;">- Anna Humalainen, Host</p></div>',
        }),
      });
      console.log('Email sent to ' + m.guestEmail);
    } catch (emailErr) {
      console.error('Email failed:', emailErr);
    }
  }

  try {
    await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
      method: 'POST',
      body: 'Instant booking: ' + m.guestFirstName + ' ' + m.guestLastName + ' | ' + m.apartmentName + ' | ' + m.checkIn + ' to ' + m.checkOut + ' | EUR ' + m.totalPrice,
      headers: {
        'Title': 'New Confirmed Booking',
        'Priority': 'high',
        'Content-Type': 'text/plain',
      },
    });
  } catch (ntfyErr) {
    console.error('ntfy failed:', ntfyErr);
  }

  return res.status(200).json({ received: true });
}
