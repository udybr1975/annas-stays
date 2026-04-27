import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Tell Vercel to NOT parse the body — Stripe needs the raw bytes to verify signature
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

  // Get raw body for Stripe signature verification
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig!, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: true });
  }

  const session = event.data.object as any;
  const m = session.metadata;

  if (!m?.referenceNumber || !m?.apartmentId || !m?.guestEmail) {
    console.error('Webhook: Missing metadata');
    return res.status(400).send('Missing metadata');
  }

  // Idempotency — skip if booking already exists
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('reference_number', m.referenceNumber)
    .maybeSingle();

  if (existing) {
    console.log(`Webhook: ${m.referenceNumber} already exists — skipping`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  // Save guest
  const { data: guestData, error: guestError } = await supabase
    .from('guests')
    .insert({
      email: m.guestEmail.toLowerCase().trim(),
      first_name: m.guestFirstName || '',
      last_name: m.guestLastName || '',
    })
    .select('id')
    .single();

  if (guestError || !guestData?.id) {
    console.error('Webhook: Failed to save guest:', guestError?.message);
    return res.status(500).send('Failed to save guest');
  }

  // Save booking
  const isInstant = m.isInstant === 'true';
  const status = isInstant ? 'confirmed' : 'pending';

  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      apartment_id: m.apartmentId,
      guest_id: guestData.id,
      check_in: m.checkIn,
      check_out: m.checkOut,
      total_price: parseFloat(m.totalPrice),
      guest_count: parseInt(m.guestCount, 10),
      status: status,
      reference_number: m.referenceNumber,
      stripe_session_id: session.id,
      stripe_setup_intent_id: isInstant ? null : (session.setup_intent || null),
      admin_needs_attention: true,
      ...(m.message ? { notes: m.message } : {}),
    })
    .select('id')
    .single();

  if (bookingError || !bookingData?.id) {
    console.error('Webhook: Failed to save booking:', bookingError?.message);
    return res.status(500).send('Failed to save booking');
  }

  console.log(`Webhook: Booking ${m.referenceNumber} saved as '${status}'`);

  // Send confirmation email
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const subject = isInstant
        ? `Booking Confirmed — #${m.referenceNumber} | Anna's Stays`
        : `Reservation Request Received — #${m.referenceNumber} | Anna's Stays`;

      const emailHtml = isInstant
        ? `<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;">
            <h2 style="font-weight:normal;font-size:1.5rem;border-bottom:1px solid #E8E3DC;padding-bottom:12px;margin-bottom:24px;">Booking Confirmed ✓</h2>
            <p>Dear ${m.guestFirstName},</p>
            <p>Your payment has been received and your stay at <strong>${m.apartmentName}</strong> is confirmed. We are so excited to welcome you to Helsinki!</p>
            <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:0.9rem;">
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Reference</td><td style="padding:10px 0;font-weight:bold;">#${m.referenceNumber}</td></tr>
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Apartment</td><td style="padding:10px 0;">${m.apartmentName}</td></tr>
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Check-in</td><td style="padding:10px 0;">${m.checkIn}</td></tr>
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Check-out</td><td style="padding:10px 0;">${m.checkOut}</td></tr>
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Guests</td><td style="padding:10px 0;">${m.guestCount}</td></tr>
              <tr><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Total Paid</td><td style="padding:10px 0;font-size:1.2rem;font-weight:bold;">€${m.totalPrice}</td></tr>
            </table>
            <p>We will send your personal entry codes 24 hours before check-in.</p>
            <p>Manage your booking at <a href="https://anna-stays.fi/find-booking" style="color:#5C7A5C;">anna-stays.fi/find-booking</a></p>
            <p style="margin-top:32px;font-style:italic;color:#5C7A5C;">— Anna Humalainen, Host</p>
          </div>`
        : `<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;">
            <h2 style="font-weight:normal;font-size:1.5rem;border-bottom:1px solid #E8E3DC;padding-bottom:12px;margin-bottom:24px;">Reservation Request Received</h2>
            <p>Dear ${m.guestFirstName},</p>
            <p>Thank you for your interest in <strong>${m.apartmentName}</strong>. Your card has been saved securely — <strong>you will only be charged if your request is approved.</strong></p>
            <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:0.9rem;">
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Request Reference</td><td style="padding:10px 0;font-weight:bold;">#${m.referenceNumber}</td></tr>
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Apartment</td><td style="padding:10px 0;">${m.apartmentName}</td></tr>
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Check-in</td><td style="padding:10px 0;">${m.checkIn}</td></tr>
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Check-out</td><td style="padding:10px 0;">${m.checkOut}</td></tr>
              <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Guests</td><td style="padding:10px 0;">${m.guestCount}</td></tr>
              <tr><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Total if Approved</td><td style="padding:10px 0;font-size:1.1rem;">€${m.totalPrice}</td></tr>
            </table>
            <p>We will review your request and notify you within a few hours.</p>
            <p>Check status at <a href="https://anna-stays.fi/find-booking" style="color:#5C7A5C;">anna-stays.fi/find-booking</a></p>
            <p style="margin-top:32px;font-style:italic;color:#5C7A5C;">— Anna Humalainen, Host</p>
          </div>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'Anna from Helsinki <onboarding@resend.dev>',
          to: [m.guestEmail],
          subject,
          html: emailHtml,
        }),
      });
      console.log(`Email sent to ${m.guestEmail}`);
    } catch (emailErr) {
      console.error('Email failed (non-fatal):', emailErr);
    }
  }

  // ntfy push notification
  const ntfyTitle = isInstant ? 'New Confirmed Booking' : 'New Booking Request';
  const ntfyBody = isInstant
    ? `💰 ${m.guestFirstName} ${m.guestLastName} | ${m.apartmentName} | ${m.checkIn} → ${m.checkOut} | ${m.guestCount} guest(s) | €${m.totalPrice}`
    : `📋 ${m.guestFirstName} ${m.guestLastName} wants to book ${m.apartmentName} | ${m.checkIn} → ${m.checkOut} | Card saved, awaiting your approval`;

  fetch('https://ntfy.sh/annas-stays-helsinki-99', {
    method: 'POST',
    body: ntfyBody,
    headers: {
      Title: ntfyTitle,
      'X-Tags': isInstant ? 'moneybag,tada' : 'envelope,eyes',
      Priority: 'high',
      Click: 'https://anna-stays.fi',
    },
  }).catch(console.error);

  return res.status(200).json({ received: true });
}
