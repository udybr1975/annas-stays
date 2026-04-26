import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig!, webhookSecret!);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata;
    if (!meta) return res.status(400).send('Missing metadata');

    // Your Reliable Reference Format
    const ref = `RES-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    try {
      // 1. Upsert Guest
      const { data: guestData } = await supabase
        .from('guests')
        .upsert({ 
          email: session.customer_details?.email?.toLowerCase(),
          first_name: meta.guestFirstName,
          last_name: meta.guestLastName
        }, { onConflict: 'email' })
        .select('id').single();

      // 2. Insert Booking
      const { error: bErr } = await supabase.from('bookings').insert({
        apartment_id: meta.apartmentId,
        guest_id: guestData?.id,
        check_in: meta.checkIn,
        check_out: meta.checkOut,
        status: meta.isInstant === 'true' ? 'confirmed' : 'pending',
        total_price: parseFloat(meta.totalPrice || "0"),
        booking_reference: ref,
        stripe_session_id: session.id
      });

      if (bErr) throw bErr;

      // 3. NTFY Push Notification
      await fetch('https://ntfy.sh/annas-stays-bookings', {
        method: 'POST',
        body: `New Booking! 🏠 ${meta.guestFirstName} reserved ${meta.apartmentId}. Ref: ${ref}`,
        headers: { 'Title': 'Anna\'s Stays: New Reservation' }
      });

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("DB Error:", err.message);
      return res.status(500).send("Database save failed");
    }
  }
  res.json({ received: true });
}
