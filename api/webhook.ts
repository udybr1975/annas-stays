import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { emailWrap, manageButton, helsinkiButton, bookingTable, apartmentBlock, entryCodesNote, annaSignature, heroImage, annaMessage } from './emailTemplate.js';

async function generateAptSummary(
  name: string,
  neighbourhood: string,
  details: { category: string; content: string }[],
  tags: string[],
): Promise<string> {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return '';
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt =
      "You are writing a warm, personal apartment description for a guest confirmation email from a boutique Helsinki short-stay host called Anna's Stays. " +
      "Using only the following public apartment details, write 3-4 sentences that highlight the best features, the neighbourhood, and practical information like check-in time. " +
      "Write in a warm, understated Scandinavian tone. Do not invent any details not present in the data. Keep it under 80 words.\n\n" +
      'Apartment name: ' + name + '\n' +
      'Neighbourhood: ' + neighbourhood + '\n' +
      'Details: ' + details.map(d => d.category + ': ' + d.content).join('\n') + '\n' +
      'Tags: ' + tags.join(', ');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const text = ((response as any).text || '').trim();
    if (!text) return '';
    return (
      '<p style="font-size:14px;color:#2C2C2A;line-height:1.8;margin:20px 0 0;">' +
      text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' ') +
      '</p>'
    );
  } catch {
    return '';
  }
}

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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

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
      .select('*, guests(*), apartments(name)')
      .eq('id', m.bookingId)
      .single();

    if (fetchError || !booking) {
      console.error('Webhook: Could not find booking for payment link completion', m.bookingId);
      return res.status(400).send('Booking not found');
    }

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
    const apt = booking.apartments as any;

    // Fetch apartment details for email
    const [{ data: aptRow }, { data: aptDetails }] = await Promise.all([
      supabase.from('apartments').select('neighborhood, tags, images').eq('id', booking.apartment_id).single(),
      supabase.from('apartment_details').select('category, content').eq('apartment_id', booking.apartment_id).eq('is_private', false),
    ]);

    const manageUrl = 'https://anna-stays.fi/manage-booking/' + booking.id + '?email=' + encodeURIComponent(guest?.email || '');
    const aptImages: string[] = aptRow?.images || [];

    // ── Step 1: Send emails immediately (no Gemini yet) ──────────────────────
    if (resendKey && guest?.email) {
      try {
        // EMAIL 4 — Booking confirmed after payment link (aiSummary fires after)
        const guestHtml = emailWrap(
          heroImage(aptImages[0] || '') +
          '<h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal;margin:0 0 8px;color:#2C2C2A;">Your booking is confirmed.</h1>' +
          '<p style="font-size:13px;color:#7A756E;margin:0 0 28px;font-style:italic;">Payment received. We look forward to welcoming you to Helsinki.</p>' +
          bookingTable([
            ['Reference',  '#' + booking.reference_number],
            ['Apartment',  apt?.name || 'the apartment'],
            ['Check-in',   booking.check_in],
            ['Check-out',  booking.check_out],
            ['Guests',     String(booking.guest_count)],
            ['Total paid', 'EUR ' + booking.total_price],
          ]) +
          apartmentBlock(
            { name: apt?.name, neighborhood: aptRow?.neighborhood, tags: aptRow?.tags },
            aptDetails || [],
          ) +
          annaMessage('Helsinki is waiting for you. I have personally made sure everything is perfect for your stay — if there is anything you need before you arrive, do not hesitate to reach out.') +
          entryCodesNote() +
          manageButton(manageUrl) +
          helsinkiButton() +
          annaSignature()
        );

        const emailRes4 = await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
          body: JSON.stringify({
            from: "Anna's Stays <info@anna-stays.fi>",
            to: [guest.email],
            subject: 'Booking Confirmed — #' + booking.reference_number + ' | Anna\'s Stays',
            html: guestHtml,
          }),
        });
        const emailRes4Body = await emailRes4.json().catch(() => null);
        console.log('Webhook Path A: guest email status:', emailRes4.status, '| body:', JSON.stringify(emailRes4Body));

        // Host notification
        await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
          body: JSON.stringify({
            from: "Anna's Stays <info@anna-stays.fi>",
            to: ['info@anna-stays.fi'],
            subject: 'Booking Confirmed via Payment Link — #' + booking.reference_number + ' | Anna\'s Stays',
            html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">Booking Confirmed — Payment Received</h2><p><strong>Guest:</strong> ' + (guest.first_name || '') + ' ' + (guest.last_name || '') + '</p><p><strong>Email:</strong> <a href="mailto:' + guest.email + '">' + guest.email + '</a></p><p><strong>Reference:</strong> #' + booking.reference_number + '</p><p><strong>Check-in:</strong> ' + booking.check_in + '</p><p><strong>Check-out:</strong> ' + booking.check_out + '</p><p><strong>Guests:</strong> ' + booking.guest_count + '</p><p><strong>Total Paid:</strong> EUR ' + booking.total_price + '</p></div>',
          }),
        });
        console.log('Webhook Path A: host notification sent');
      } catch (emailErr) {
        console.error('Webhook Path A: email failed:', emailErr);
      }
    }

    try {
      await fetch(process.env.NTFY_URL!, {
        method: 'POST',
        body: 'Payment received: ' + (guest?.first_name || '') + ' ' + (guest?.last_name || '') + ' | ' + booking.reference_number + ' | EUR ' + booking.total_price,
        headers: {
          'Title': 'Booking Confirmed - Payment Received',
          'Priority': 'high',
          'Content-Type': 'text/plain',
        },
      });
    } catch (ntfyErr) {
      console.error('ntfy failed:', ntfyErr);
    }

    // ── Step 2: Gemini fires after emails — truly non-blocking ────────────────
    void Promise.race([
      generateAptSummary(apt?.name || '', aptRow?.neighborhood || '', aptDetails || [], aptRow?.tags || []),
      new Promise<string>(resolve => setTimeout(() => resolve(''), 3000)),
    ]).then(summary => {
      if (summary) console.log('Webhook Path A: Gemini summary generated (' + summary.length + ' chars)');
    }).catch(() => {});

    return res.status(200).json({ received: true });
  }

  // ── PATH B: Instant book ───────────────────────────────────────────────────
  if (!m || !m.referenceNumber || !m.apartmentId || !m.guestEmail) {
    console.error('Webhook: Missing metadata');
    return res.status(400).send('Missing metadata');
  }

  if (m.isInstant !== 'true') {
    console.log('Webhook: Non-instant booking without approve_booking source — ignoring');
    return res.status(200).json({ received: true, ignored: true });
  }

  const { data: existing } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('reference_number', m.referenceNumber)
    .maybeSingle();

  let bookingId: string;

  if (existing) {
    if (existing.status === 'confirmed') {
      console.log('Webhook: ' + m.referenceNumber + ' already confirmed - skipping');
      return res.status(200).json({ received: true, duplicate: true });
    }
    // Pre-existing booking not yet confirmed — update it and proceed to send emails
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
        admin_needs_attention: true,
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Webhook: Failed to confirm pre-existing booking:', updateError.message);
      return res.status(500).send('Failed to confirm booking');
    }

    console.log('Webhook: Pre-existing booking ' + m.referenceNumber + ' confirmed via payment');
    bookingId = existing.id;
  } else {
    // Always insert a fresh guest row — email is no longer unique
    const { data: newGuest, error: guestError } = await supabase
      .from('guests')
      .insert({
        email: m.guestEmail.toLowerCase().trim(),
        first_name: m.guestFirstName || '',
        last_name: m.guestLastName || '',
      })
      .select('id')
      .single();

    if (guestError || !newGuest?.id) {
      console.error('Webhook: Failed to save guest:', guestError?.message);
      return res.status(500).send('Failed to save guest');
    }

    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        apartment_id: m.apartmentId,
        guest_id: newGuest.id,
        check_in: m.checkIn,
        check_out: m.checkOut,
        total_price: parseFloat(m.totalPrice),
        guest_count: parseInt(m.guestCount, 10),
        status: 'confirmed',
        reference_number: m.referenceNumber,
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent || null,
        admin_needs_attention: true,
        notes: m.message || null,
      })
      .select('id')
      .single();

    if (bookingError) {
      if (bookingError.code === '23505' || bookingError.message?.includes('duplicate key')) {
        console.log('Webhook: ' + m.referenceNumber + ' race condition — booking already saved by concurrent webhook, skipping');
        return res.status(200).json({ received: true, duplicate: true });
      }
      console.error('Webhook: Failed to save booking:', bookingError?.message);
      return res.status(500).send('Failed to save booking');
    }
    if (!bookingData?.id) {
      console.error('Webhook: Booking insert returned no id');
      return res.status(500).send('Failed to save booking');
    }

    console.log('Webhook: Instant booking ' + m.referenceNumber + ' confirmed');
    bookingId = bookingData.id;
  }

  // Fetch apartment details for email
  const [{ data: aptRow }, { data: aptDetails }] = await Promise.all([
    supabase.from('apartments').select('neighborhood, tags, images').eq('id', m.apartmentId).single(),
    supabase.from('apartment_details').select('category, content').eq('apartment_id', m.apartmentId).eq('is_private', false),
  ]);

  const manageUrl = 'https://anna-stays.fi/manage-booking/' + bookingId + '?email=' + encodeURIComponent(m.guestEmail);
  const aptImages: string[] = aptRow?.images || [];

  // ── Step 1: Send emails immediately (no Gemini yet) ────────────────────────
  console.log('Webhook Path B: resendKey set:', !!resendKey, '| guestEmail:', m.guestEmail);
  if (resendKey) {
    try {
      console.log('Webhook Path B: attempting guest email to', m.guestEmail);
      // EMAIL 1 — Instant booking confirmed (aiSummary fires after)
      const guestHtml = emailWrap(
        heroImage(aptImages[0] || '') +
        '<h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal;margin:0 0 8px;color:#2C2C2A;">Your booking is confirmed.</h1>' +
        '<p style="font-size:13px;color:#7A756E;margin:0 0 28px;font-style:italic;">We look forward to welcoming you to Helsinki.</p>' +
        bookingTable([
          ['Reference',  '#' + m.referenceNumber],
          ['Apartment',  m.apartmentName],
          ['Check-in',   m.checkIn],
          ['Check-out',  m.checkOut],
          ['Guests',     m.guestCount],
          ['Total paid', 'EUR ' + m.totalPrice],
        ]) +
        apartmentBlock(
          { name: m.apartmentName, neighborhood: aptRow?.neighborhood, tags: aptRow?.tags },
          aptDetails || [],
        ) +
        annaMessage('Helsinki is waiting for you. I have personally made sure everything is perfect for your stay — if there is anything you need before you arrive, do not hesitate to reach out.') +
        entryCodesNote() +
        manageButton(manageUrl) +
        helsinkiButton() +
        annaSignature()
      );

      const emailRes1 = await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
        body: JSON.stringify({
          from: "Anna's Stays <info@anna-stays.fi>",
          to: [m.guestEmail],
          subject: 'Booking Confirmed — #' + m.referenceNumber + ' | Anna\'s Stays',
          html: guestHtml,
        }),
      });
      const emailRes1Body = await emailRes1.json().catch(() => null);
      console.log('Webhook Path B: guest email status:', emailRes1.status, '| body:', JSON.stringify(emailRes1Body));

      // Host notification
      console.log('Webhook Path B: attempting host email to info@anna-stays.fi');
      await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
        body: JSON.stringify({
          from: "Anna's Stays <info@anna-stays.fi>",
          to: ['info@anna-stays.fi'],
          subject: 'New Confirmed Booking — #' + m.referenceNumber + ' | Anna\'s Stays',
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">New Confirmed Booking</h2><p><strong>Guest:</strong> ' + m.guestFirstName + ' ' + m.guestLastName + '</p><p><strong>Email:</strong> <a href="mailto:' + m.guestEmail + '">' + m.guestEmail + '</a></p><p><strong>Apartment:</strong> ' + m.apartmentName + '</p><p><strong>Reference:</strong> #' + m.referenceNumber + '</p><p><strong>Check-in:</strong> ' + m.checkIn + '</p><p><strong>Check-out:</strong> ' + m.checkOut + '</p><p><strong>Guests:</strong> ' + m.guestCount + '</p><p><strong>Total Paid:</strong> EUR ' + m.totalPrice + '</p></div>',
        }),
      });
      console.log('Webhook Path B: host notification sent');
    } catch (emailErr) {
      console.error('Webhook Path B: email failed:', emailErr);
    }
  } else {
    console.error('Webhook Path B: RESEND_API_KEY not set — skipping all emails');
  }

  console.log('Webhook Path B: sending ntfy');
  try {
    await fetch(process.env.NTFY_URL!, {
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

  // ── Step 2: Gemini fires after emails — truly non-blocking ──────────────────
  void Promise.race([
    generateAptSummary(m.apartmentName || '', aptRow?.neighborhood || '', aptDetails || [], aptRow?.tags || []),
    new Promise<string>(resolve => setTimeout(() => resolve(''), 3000)),
  ]).then(summary => {
    if (summary) console.log('Webhook Path B: Gemini summary generated (' + summary.length + ' chars)');
  }).catch(() => {});

  return res.status(200).json({ received: true });
}
