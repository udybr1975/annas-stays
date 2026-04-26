import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { booking, listing, guest, isInstantBook } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: listing.name,
              description: `${booking.nights} nights at Anna's Stays`,
            },
            unit_amount: Math.round(booking.totalPrice * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      payment_intent_data: {
        // This is the magic: 'manual' if approval is needed, 'automatic' if not.
        capture_method: isInstantBook ? 'automatic' : 'manual',
      },
      // Redirect to your success page
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/`,
      customer_email: guest.email,
      metadata: {
        apartmentId: listing.id,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        isInstant: isInstantBook.toString()
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
