import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js'; // Fixed import
import { buffer } from 'micro'; // Required for Vercel raw body handling

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export const config = {
  api: {
    bodyParser: false, // Required for Stripe signature verification
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig!, webhookSecret!);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata;

    if (!metadata) {
      console.error("No metadata found in session");
      return res.status(400).send("Missing metadata");
    }

    try {
      // 1. Create or Update Guest Record
      const { data: guestData, error: guestError } = await supabase
        .from('guests')
        .upsert({ 
            email: session.customer_details?.email?.toLowerCase().trim(),
            first_name: metadata.guestFirstName || session.customer_details?.name?.split(' ')[0],
            last_name: metadata.guestLastName || ''
        }, { onConflict: 'email' })
        .select('id')
        .single();

      if (guestError) throw guestError;

      // 2. Create Booking Record
      const status = metadata.isInstant === 'true' ? 'confirmed' : 'pending';
      
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          apartment_id: metadata.apartmentId,
          guest_id: guestData?.id,
          check_in: metadata.checkIn,   // NOW SAVING THE DATES
          check_out: metadata.checkOut, // NOW SAVING THE DATES
          status: status,
          total_price: parseFloat(metadata.totalPrice || "0"),
          payment_intent_id: session.payment_intent as string,
          stripe_session_id: session.id
        });

      if (bookingError) throw bookingError;

      console.log(`✅ Booking successfully saved for ${session.customer_details?.email}`);

    } catch (dbError: any) {
      console.error("❌ Database Error:", dbError.message);
      return res.status(500).json({ error: "Failed to save booking" });
    }
  }

  res.json({ received: true });
}
