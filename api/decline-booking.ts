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

  // 1. Fetch booking + guest
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*, guests(*)')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const guest = Array.isArray(booking.guests) ? booking.guests[0] : booking.guests;

  // 2. Update status to declined
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'declined', admin_needs_attention: false })
    .eq('id', bookingId);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to decline booking: ' + updateError.message });
  }

  // 3. Send decline email to guest
  if (resendKey && guest?.email) {
    try {
      const guestFirstName = guest.first_name || 'Guest';
      const aptName = booking.apartment_name || 'the apartment';

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + resendKey,
        },
        body: JSON.stringify({
          from: "Anna's Stays <info@anna-stays.fi>",
          to: [guest.email],
          subject: 'Regarding Your Booking Request — #' + booking.reference_number + ' | Anna\'s Stays',
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;">'
            + '<h2 style="font-weight:normal;">Booking Request Update</h2>'
            + '<p>Dear ' + guestFirstName + ',</p>'
            + '<p>Thank you so much for your interest in staying at <strong>' + aptName + '</strong>.</p>'
            + '<p>Unfortunately, we are unable to accommodate your request for the dates <strong>' + booking.check_in + '</strong> to <strong>' + booking.check_out + '</strong> at this time.</p>'
            + '<div style="background-color:#F7F4EF;padding:20px;border-left:4px solid #B09B89;margin:20px 0;font-style:italic;">'
            + '"I truly hope we will have the opportunity to welcome you to Helsinki another time. Please do not hesitate to reach out if you would like to check availability for other dates."'
            + '<br><br>— Anna</div>'
            + '<p style="font-size:0.8rem;color:#7A756E;margin-top:30px;">If you have any questions, please reach out at info@anna-stays.fi</p>'
            + '</div>',
        }),
      });
      console.log('Decline email sent to ' + guest.email);
    } catch (emailErr) {
      console.error('Decline email failed (non-critical):', emailErr);
    }
  }

  // 4. Notification email to Anna
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
          to: ['info@anna-stays.fi'],
          subject: 'Booking Request Declined — #' + booking.reference_number + ' | Anna\'s Stays',
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;">'
            + '<h2 style="font-weight:normal;">Booking Request Declined</h2>'
            + '<p><strong>Guest:</strong> ' + (guest.first_name || '') + ' ' + (guest.last_name || '') + '</p>'
            + '<p><strong>Email:</strong> <a href="mailto:' + guest.email + '">' + guest.email + '</a></p>'
            + '<p><strong>Reference:</strong> #' + booking.reference_number + '</p>'
            + '<p><strong>Check-in:</strong> ' + booking.check_in + '</p>'
            + '<p><strong>Check-out:</strong> ' + booking.check_out + '</p>'
            + '<p><strong>Total:</strong> EUR ' + booking.total_price + '</p>'
            + '</div>',
        }),
      });
    } catch (emailErr) {
      console.error('Info notification email failed (non-critical):', emailErr);
    }
  }

  // 5. ntfy to Anna
  try {
    await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
      method: 'POST',
      body: 'Declined: ' + (guest?.first_name || '') + ' ' + (guest?.last_name || '') + ' | ' + booking.reference_number,
      headers: {
        'Title': 'Booking Request Declined',
        'Priority': 'low',
        'Content-Type': 'text/plain',
      },
    });
  } catch (ntfyErr) {
    console.error('ntfy failed (non-critical):', ntfyErr);
  }

  return res.status(200).json({ success: true });
}
