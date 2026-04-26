import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-base';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

// Initialize Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use Service Role for backend writes
);

export const config = {
  api: {
    bodyParser: false, // Stripe needs the raw body to verify the signature
  },
};

async function buffer(readable: any) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret!);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the successful checkout event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Extract the data we sent in metadata
    const { apartmentId, isInstant } = session.metadata || {};
    const guestEmail = session.customer_details?.email;
    const guestName = session.customer_details?.name || 'Guest';

    try {
      // 1. Create Guest Record
      const { data: guestData } = await supabase
        .from('guests')
        .insert({ 
            email: guestEmail?.toLowerCase().trim(),
            first_name: guestName.split(' ')[0],
            last_name: guestName.split(' ').slice(1).join(' ') || ''
        })
        .select('id')
        .single();

      // 2. Create Booking Record
      const status = isInstant === 'true' ? 'confirmed' : 'pending';
      
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          apartment_id: apartmentId,
          guest_id: guestData?.id,
          status: status,
          total_price: session.amount_total ? session.amount_total / 100 : 0,
          payment_intent_id: session.payment_intent as string,
          // Note: Check-in/out dates should be stored in session metadata during creation
          // For now, we are capturing the successful payment.
        });

      if (bookingError) throw bookingError;

      // 3. Trigger Email (You can call your /api/send-email here internally)
      console.log(`Booking successfully saved for ${guestEmail}`);

    } catch (dbError: any) {
      console.error("Database Error:", dbError.message);
      return res.status(500).json({ error: "Failed to save booking" });
    }
  }

  res.json({ received: true });
}
