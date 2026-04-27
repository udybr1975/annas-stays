import Stripe from 'stripe';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
  const { booking, listing, guest, isInstantBook } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: listing.name, description: `${booking.nights} nights at Anna's Stays` },
          unit_amount: Math.round(booking.totalPrice * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: guest.email,
      // FIXED: Added &apartmentId=${listing.id} so the success screen knows what to show
      success_url: `${req.headers.origin}/?status=success&session_id={CHECKOUT_SESSION_ID}&apartmentId=${listing.id}&checkIn=${booking.checkIn}&checkOut=${booking.checkOut}&guestCount=${booking.guestCount}&total=${booking.totalPrice}&fn=${guest.firstName}`,
      cancel_url: `${req.headers.origin}/`,
      metadata: {
        apartmentId: String(listing.id),
        checkIn: String(booking.checkIn),
        checkOut: String(booking.checkOut),
        isInstant: String(isInstantBook),
        guestFirstName: String(guest.firstName),
        guestLastName: String(guest.lastName),
        totalPrice: String(booking.totalPrice),
        guestCount: String(booking.guestCount) 
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
