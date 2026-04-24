import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Get the data from the request
    const body = req.body || {};
    
    // 2. NORMALIZE: This handles both formats (booking.check_in OR checkIn)
    const booking = body.booking || body;
    const listing = body.listing || body.apartment || {};
    const guest = body.guest || body;

    const safeBooking = {
      check_in: booking.check_in || booking.checkIn || 'TBD',
      check_out: booking.check_out || booking.checkOut || 'TBD',
      total_price: booking.total_price || booking.price || booking.totalPrice || '0',
      guest_count: booking.guest_count || booking.guests || 1,
      id: booking.id || 'new'
    };

    const safeGuest = {
      first_name: guest.first_name || guest.name?.split(' ')[0] || 'Guest',
      email: guest.email || 'udy.bar.yosef@gmail.com'
    };

    const safeListing = {
      name: listing.name || 'Anna\'s Stays',
      imgs: listing.imgs || listing.images || [],
      neigh: listing.neigh || 'Helsinki'
    };

    // 3. Generate HTML with the "Safe" data
    const emailHtml = generateBookingEmailHtml(safeBooking, safeListing, safeGuest);

    // 4. Send to YOUR email only for this test
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: ['udy.bar.yosef@gmail.com'], // Hardcoded to YOUR email
      subject: `Booking Confirmed: ${safeListing.name}`,
      html: emailHtml,
    });

    if (error) {
      console.error("Resend Error:", error);
      return res.status(400).json(error);
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("Function Crash:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
