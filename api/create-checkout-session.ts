import Stripe from 'stripe';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
          return res.status(500).json({ error: 'Stripe secret key is not configured. Please set STRIPE_SECRET_KEY in your environment variables.' });
    }

  const stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2023-10-16' as any,
  });

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
                        // 'automatic' for instant booking (charge immediately),
                // 'manual' for request-to-book (authorise only, capture later when host confirms)
                capture_method: isInstantBook ? 'automatic' : 'manual',
              },
              success_url: `${req.headers.origin}/?status=success&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${req.headers.origin}/`,
              customer_email: guest.email,
              metadata: {
                        apartmentId: listing.id,
                        checkIn: booking.checkIn,
                        checkOut: booking.checkOut,
                        isInstant: isInstantBook.toString(),
              },
      });

      return res.status(200).json({ url: session.url });
  } catch (err: any) {
        return res.status(500).json({ error: err.message });
  }
}
