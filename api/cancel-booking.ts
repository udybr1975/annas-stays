import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
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
    .select('*, guests(*)')
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
  const guestEmail = guest?.email || null;
  const guestFirstName = guest?.first_name || 'Guest';
  const guestFullName = `${guest?.first_name || ''} ${guest?.last_name || ''}`.trim() || 'A guest';
  const referenceNumber = booking.reference_number || booking.id?.slice(0, 8) || '';
  const apartmentName = booking.apartment_name || 'the apartment';

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
          subject: 'Reservation Cancelled — #' + referenceNumber + ' | Anna\'s Stays',
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;border-bottom:1px solid #B09B89;padding-bottom:10px;">Reservation Cancelled</h2><p>Dear ' + guestFirstName + ',</p><p>This email confirms that your reservation <strong>#' + referenceNumber + '</strong> at <strong>' + apartmentName + '</strong> has been cancelled.</p>' + (refundIssued ? '<p>A full refund of <strong>EUR ' + booking.total_price + '</strong> has been issued to your original payment method and should appear within 5–10 business days.</p>' : '') + '<div style="background-color:#F7F4EF;padding:20px;border-left:4px solid #B09B89;margin:20px 0;font-style:italic;">"I am so sorry to see your cancellation. I was really looking forward to hosting you in Helsinki! I completely understand that plans change, and I truly hope to have the chance to welcome you to one of my stays another time."<br><br>— Anna</div><p style="font-size:0.8rem;color:#7A756E;margin-top:30px;">If you have any questions, please reach out at info@anna-stays.fi</p></div>',
        }),
      });
      console.log('Cancellation email sent to ' + guestEmail);
    } catch (emailErr) {
      console.error('Cancellation email failed (non-critical):', emailErr);
    }
  }

  // 5. Send host notification email
  if (resendKey) {
    try {
      await fetch('https://api.resend.com/emails', {
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
    await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
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
