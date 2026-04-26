import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export const config = { api: { bodyParser: false } };

async function getRawBody(readable: any) {
  const chunks = [];
  for await (const chunk of readable) { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); }
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  const buf = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
    const event = stripe.webhooks.constructEvent(buf, sig!, webhookSecret!);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const m = session.metadata;
      if (!m) return res.status(400).send('No metadata');

      const ref = `RES-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      // 1. Save Guest
      const { data: guestData, error: gErr } = await supabase
        .from('guests')
        .upsert({ 
          email: session.customer_details?.email?.toLowerCase(),
          first_name: m.guestFirstName,
          last_name: m.guestLastName 
        }, { onConflict: 'email' }).select('id').single();

      if (gErr) throw gErr;

      // 2. Save Booking
      const { error: bErr } = await supabase.from('bookings').insert({
        apartment_id: m.apartmentId,
        guest_id: guestData.id,
        check_in: m.checkIn,
        check_out: m.checkOut,
        total_price: parseFloat(m.totalPrice),
        status: m.isInstant === 'true' ? 'confirmed' : 'pending',
        booking_reference: ref,
        stripe_session_id: session.id,
        guest_count: parseInt(m.guestCount)
      });

      if (bErr) throw bErr;

      // 3. CORRECTED NTFY URL
      await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
        method: 'POST',
        body: `New Booking! 🏠 ${m.guestFirstName} reserved ${m.apartmentId}. Dates: ${m.checkIn} to ${m.checkOut}. Ref: ${ref}`,
        headers: { 
          'Title': "Anna's Stays: New Reservation",
          'Tags': 'house,euro'
        }
      });
    }
    return res.status(200).json({ received: true });
  } catch (err: any) {
    return res.status(400).send(`Error: ${err.message}`);
  }
}
