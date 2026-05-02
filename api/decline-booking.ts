import { createClient } from '@supabase/supabase-js';
import { emailWrap, annaSignature, annaMessage } from './emailTemplate.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

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

  if (booking.status !== 'pending') {
    return res.status(400).json({ error: 'Booking is not in pending state' });
  }

  // Extract guest data from DB
  const guestData = booking.guests;
  const guest = Array.isArray(guestData) ? guestData[0] : guestData;
  const guestEmail = guest?.email || null;
  const guestFirstName = guest?.first_name || 'Guest';
  const guestFullName = `${guest?.first_name || ''} ${guest?.last_name || ''}`.trim() || 'A guest';
  const referenceNumber = booking.reference_number || booking.id?.slice(0, 8) || '';
  const apartmentName = (booking.apartments as any)?.name || 'the apartment';

  // 2. Update booking status to declined
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'declined',
      admin_needs_attention: false,
    })
    .eq('id', bookingId);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to decline booking: ' + updateError.message });
  }

  // 3. Send decline email to guest
  if (resendKey && guestEmail) {
    try {
      const guestHtml = emailWrap(
        '<h1 style="font-family:Georgia,serif;font-size:26px;font-weight:normal;margin:0 0 8px;color:#2C2C2A;">We\'re sorry we can\'t accommodate you.</h1>' +
        '<p style="font-size:13px;color:#7A756E;margin:0 0 28px;font-style:italic;">Thank you for your interest in staying at ' + apartmentName + '.</p>' +
        '<p style="font-size:14px;color:#2C2C2A;line-height:1.7;margin:0 0 24px;">Unfortunately we are unable to host your request for the selected dates. We truly hope to welcome you to Helsinki another time.</p>' +
        annaMessage('I am truly sorry I cannot host you this time. Helsinki will be here whenever you are ready — I hope to welcome you another time.') +
        '<div style="text-align:center;margin:36px 0 8px;">' +
        '<a href="https://anna-stays.fi" style="display:inline-block;padding:13px 30px;border:1.5px solid #3D4F3E;color:#3D4F3E;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;">' +
        'Browse Availability &rarr;' +
        '</a>' +
        '</div>' +
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
          subject: 'Regarding Your Reservation Request — #' + referenceNumber + ' | Anna\'s Stays',
          html: guestHtml,
        }),
      });
      console.log('Decline email sent to ' + guestEmail);
    } catch (emailErr) {
      console.error('Decline email failed (non-critical):', emailErr);
    }
  }

  // 4. Send host notification email
  if (resendKey) {
    try {
      await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
        body: JSON.stringify({
          from: "Anna's Stays <info@anna-stays.fi>",
          to: ['info@anna-stays.fi'],
          subject: 'Booking Request Declined — #' + referenceNumber + ' | Anna\'s Stays',
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">Booking Request Declined</h2><p><strong>Guest:</strong> ' + guestFullName + '</p><p><strong>Email:</strong> ' + (guestEmail || 'N/A') + '</p><p><strong>Reference:</strong> #' + referenceNumber + '</p><p><strong>Apartment:</strong> ' + apartmentName + '</p><p><strong>Check-in:</strong> ' + booking.check_in + '</p><p><strong>Check-out:</strong> ' + booking.check_out + '</p><p><strong>Total:</strong> EUR ' + booking.total_price + '</p></div>',
        }),
      });
      console.log('Host notification sent to info@anna-stays.fi');
    } catch (hostEmailErr) {
      console.error('Host notification email failed (non-critical):', hostEmailErr);
    }
  }

  // 5. Send ntfy to Anna
  try {
    await fetch(process.env.NTFY_URL!, {
      method: 'POST',
      body: 'Booking request declined: ' + guestFullName + ' | ' + referenceNumber + ' | ' + apartmentName,
      headers: {
        'Title': 'Booking Request Declined',
        'Priority': 'default',
        'Content-Type': 'text/plain',
      },
    });
  } catch (ntfyErr) {
    console.error('ntfy failed (non-critical):', ntfyErr);
  }

  return res.status(200).json({ success: true });
}
