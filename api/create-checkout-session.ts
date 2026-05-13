import Stripe from 'stripe';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${parseInt(day)} ${MONTHS[parseInt(month) - 1]} ${year}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe is not configured on the server.' });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
  const { booking, listing, guest, isInstantBook } = req.body;

  if (!booking?.referenceNumber || !listing?.id || !guest?.email) {
    return res.status(400).json({ error: 'Missing required booking information.' });
  }

  const origin = req.headers.origin || 'https://anna-stays.fi';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const rawImg: string | undefined = (listing.imgs || [])[0];
  const stripeImages: string[] = rawImg
    ? [rawImg.startsWith('http') ? rawImg : `${supabaseUrl}/storage/v1/object/public/apartment-images/${rawImg}`]
    : [];

  try {
    if (isInstantBook) {
      // INSTANT BOOK: Charge the full amount immediately.
      // Webhook will then save guest + booking to Supabase as 'confirmed'.
      console.log('[create-checkout-session] listing.imgs received:', JSON.stringify(listing.imgs));
      console.log('[create-checkout-session] stripeImages resolved:', JSON.stringify(stripeImages));
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: guest.email,
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: listing.name,
                description: `${booking.nights}-night stay in Helsinki · ${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}`,
                images: stripeImages,
              },
              unit_amount: Math.round(booking.totalPrice * 100),
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}&ref=${booking.referenceNumber}`,
        cancel_url: `${origin}/`,
        metadata: {
          // Everything needed to create the booking in the webhook
          referenceNumber: String(booking.referenceNumber),
          apartmentId: String(listing.id),
          apartmentName: String(listing.name),
          guestFirstName: String(guest.firstName),
          guestLastName: String(guest.lastName),
          guestEmail: String(guest.email),
          checkIn: String(booking.checkIn),
          checkOut: String(booking.checkOut),
          guestCount: String(booking.guestCount),
          totalPrice: String(booking.totalPrice),
          car: String(booking.car || false),
          transfer: String(booking.transfer || false),
          message: String(booking.message || ''),
          isInstant: 'true',
        },
      });

      return res.status(200).json({ url: session.url });

    } else {
      // PENDING APPROVAL: Save card without charging.
      // Guest will only be charged when you approve in the admin dashboard.
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'setup',
        customer_email: guest.email,
        success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}&ref=${booking.referenceNumber}&pending=true`,
        cancel_url: `${origin}/`,
        metadata: {
          referenceNumber: String(booking.referenceNumber),
          apartmentId: String(listing.id),
          apartmentName: String(listing.name),
          guestFirstName: String(guest.firstName),
          guestLastName: String(guest.lastName),
          guestEmail: String(guest.email),
          checkIn: String(booking.checkIn),
          checkOut: String(booking.checkOut),
          guestCount: String(booking.guestCount),
          totalPrice: String(booking.totalPrice),
          car: String(booking.car || false),
          transfer: String(booking.transfer || false),
          message: String(booking.message || ''),
          isInstant: 'false',
        },
      });

      return res.status(200).json({ url: session.url });
    }
  } catch (err: any) {
    console.error('Stripe checkout session error:', err);
    return res.status(500).json({ error: err.message });
  }
}
