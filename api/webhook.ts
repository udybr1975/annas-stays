import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const chunks = [];
  for await (const chunk of req) { chunks.push(chunk); }
  const buf = Buffer.concat(chunks);
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(buf, sig!, process.env.STRIPE_WEBHOOK_SECRET!);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const m = session.metadata;
      if (!m) return res.status(400).send('No metadata');

      const ref = `RES-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const email = session.customer_details?.email?.toLowerCase().trim();

      // --- GUEST LOGIC (Returning Guest Fix) ---
      let guestId;
      const { data: existingGuest } = await supabase
        .from('guests')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingGuest) {
        guestId = existingGuest.id;
      } else {
        const { data: newGuest, error: gErr } = await supabase
          .from('guests')
          .insert({ 
            email: email,
            first_name: m.guestFirstName,
            last_name: m.guestLastName 
          })
          .select('id').single();
        if (gErr) throw gErr;
        guestId = newGuest.id;
      }

      // --- BOOKING LOGIC (Matching your DB image) ---
      const { error: bErr } = await supabase.from('bookings').insert({
        apartment_id: m.apartmentId,
        guest_id: guestId,
        check_in: m.checkIn,
        check_out: m.checkOut,
        total_price: parseFloat(m.totalPrice),
        status: m.isInstant === 'true' ? 'confirmed' : 'pending',
        booking_reference: ref,
        stripe_session_id: session.id,
        guest_count: parseInt(m.guestCount)
      });

      if (bErr) throw bErr;

      // --- NTFY NOTIFICATION ---
      try {
        await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
          method: 'POST',
          body: `New Booking! 🏠 ${m.guestFirstName} reserved ${m.apartmentId}. Ref: ${ref}`,
          headers: { 'Title': "Anna's Stays: New Reservation", 'Tags': 'house,euro' }
        });
      } catch (e) { /* ignore */ }
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
