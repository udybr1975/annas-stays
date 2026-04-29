import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
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
    .select('*, guests(*)')
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
  const apartmentName = booking.apartment_name || 'the apartment';

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
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + resendKey,
        },
        body: JSON.stringify({
          from: "Anna's Stays <info@anna-stays.fi>",
          to: [guestEmail],
          subject: 'Regarding Your Reservation Request — #' + referenceNumber + ' | Anna\'s Stays',
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;border-bottom:1px solid #B09B89;padding-bottom:10px;">Reservation Request Update</h2><p>Dear ' + guestFirstName + ',</p><p>Thank you for your interest in staying at <strong>' + apartmentName + '</strong>. Unfortunately we are unable to accommodate your request for the selected dates.</p><p>We hope to welcome you another time. Please feel free to check availability for other dates.</p><div style="background-color:#F7F4EF;padding:20px;border-left:4px solid #B09B89;margin:20px 0;font-style:italic;">"I am sorry I cannot host you this time. I truly hope we will have the chance to meet in Helsinki on another occasion."<br><br>— Anna</div><p style="font-size:0.8rem;color:#7A756E;margin-top:30px;">If you have any questions, please reach out at info@anna-stays.fi</p></div>',
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
      await fetch('https://api.resend.com/emails', {
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
    await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
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
