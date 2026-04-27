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

  if (!bookingId) {
    return res.status(400).json({ error: 'Missing bookingId' });
  }

  // 1. Fetch booking from Supabase
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

  if (!booking.stripe_setup_intent_id) {
    return res.status(400).json({ error: 'No saved payment method found for this booking' });
  }

  try {
    // 2. Retrieve the SetupIntent to get the saved payment method
    const setupIntent = await stripe.setupIntents.retrieve(booking.stripe_setup_intent_id);

    if (!setupIntent.payment_method) {
      return res.status(400).json({ error: 'No payment method attached to this setup intent' });
    }

    const paymentMethodId = typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method.id;

    // 3. Create a Stripe Customer and attach the payment method
    const customer = await stripe.customers.create({
      email: booking.guests?.email || '',
      name: `${booking.guests?.first_name || ''} ${booking.guests?.last_name || ''}`.trim(),
      payment_method: paymentMethodId,
    });

    // 4. Charge the card
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booking.total_price * 100),
      currency: 'eur',
      customer: customer.id,
      payment_method: paymentMethodId,
      confirm: true,
      description: `Anna's Stays — Booking ${booking.reference_number}`,
      metadata: {
        bookingId: booking.id,
        referenceNumber: booking.reference_number,
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });

    if (paymentIntent.status !== 'succeeded') {
      return res.status(402).json({ error: 'Payment failed: ' + paymentIntent.status });
    }

    // 5. Update booking to confirmed in Supabase
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        admin_needs_attention: false,
        stripe_payment_intent_id: paymentIntent.id,
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('Failed to update booking status:', updateError);
      return res.status(500).json({ error: 'Payment succeeded but failed to update booking status' });
    }

    // 6. Send confirmation email to guest
    if (resendKey && booking.guests?.email) {
      try {
        const guestFirstName = booking.guests?.first_name || 'Guest';
        const aptName = booking.apartment_name || 'the apartment';

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + resendKey,
          },
          body: JSON.stringify({
            from: "Anna's Stays <info@anna-stays.fi>",
            to: [booking.guests.email],
            subject: 'Booking Confirmed - #' + booking.reference_number + ' | Annas Stays',
            html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">Your Stay is Confirmed</h2><p>Dear ' + guestFirstName + ',</p><p>Great news! Your reservation request for <strong>' + aptName + '</strong> has been approved and your card has been charged.</p><p><strong>Reference:</strong> #' + booking.reference_number + '</p><p><strong>Check-in:</strong> ' + booking.check_in + '</p><p><strong>Check-out:</strong> ' + booking.check_out + '</p><p><strong>Guests:</strong> ' + booking.guest_count + '</p><p><strong>Total Charged:</strong> EUR ' + booking.total_price + '</p><p>We will send your entry codes 24 hours before check-in.</p><p style="font-style:italic;color:#5C7A5C;">- Anna Humalainen, Host</p></div>',
          }),
        });
        console.log('Confirmation email sent to ' + booking.guests.email);
      } catch (emailErr) {
        console.error('Email failed (non-critical):', emailErr);
      }
    }

    // 7. Send ntfy notification
    try {
      await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
        method: 'POST',
        body: 'Approved & charged: ' + (booking.guests?.first_name || '') + ' ' + (booking.guests?.last_name || '') + ' | ' + booking.reference_number + ' | EUR ' + booking.total_price,
        headers: {
          'Title': 'Booking Approved',
          'Priority': 'high',
          'Content-Type': 'text/plain',
        },
      });
    } catch (ntfyErr) {
      console.error('ntfy failed (non-critical):', ntfyErr);
    }

    return res.status(200).json({ success: true, paymentIntentId: paymentIntent.id });

  } catch (err: any) {
    console.error('Approve booking error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected error' });
  }
}
