import { Resend } from 'resend';
// IMPORTANT: Keep the .js extension so the Vercel build engine finds the file
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};

    // --- ROUTE 1: MANUAL HOST MESSAGE (From Admin Dashboard) ---
    // If the request contains an 'html' string, it means the Admin is sending a custom message.
    if (body.html && body.to) {
      const { data, error } = await resend.emails.send({
        from: "Anna's Stays <onboarding@resend.dev>",
        to: [body.to],
        subject: body.subject || "A message from your host at Anna's Stays",
        html: body.html,
      });

      if (error) {
        console.error("Resend Manual Message Error:", error);
        return res.status(400).json(error);
      }

      return res.status(200).json({ success: true, data });
    }

    // --- ROUTE 2: STANDARD BOOKING CONFIRMATION ---
    // If no 'html' is provided, we build the beautiful template using the booking data.
    const booking = body.booking || body;
    const listing = body.listing || body.apartment || {};
    const guest = body.guest || body;

    // Safety fallback for data names (handles checkIn vs check_in)
    const normalizedBooking = {
      ...booking,
      check_in: booking.check_in || booking.checkIn || 'TBD',
      check_out: booking.check_out || booking.checkOut || 'TBD',
      total_price: booking.total_price || booking.totalPrice || '0',
      guest_count: booking.guest_count || booking.guests || 1,
      id: booking.id || 'new'
    };

    const normalizedGuest = {
      ...guest,
      first_name: guest.first_name || guest.name?.split(' ')[0] || 'Guest',
      email: guest.email || body.to // Use 'to' as fallback
    };

    const normalizedListing = {
      ...listing,
      name: listing.name || "Anna's Stays",
      imgs: listing.imgs || listing.images || []
    };

    const emailHtml = generateBookingEmailHtml(normalizedBooking, normalizedListing, normalizedGuest);

    const { data, error } = await resend.emails.send({
      from: "Anna's Stays <onboarding@resend.dev>",
      to: [normalizedGuest.email],
      subject: `Booking Confirmed: ${normalizedListing.name}`,
      html: emailHtml,
    });

    if (error) {
      console.error("Resend Confirmation Error:", error);
      return res.status(400).json(error);
    }

    return res.status(200).json({ success: true, data });

  } catch (err) {
    console.error("Critical Server Error:", err.message);
    return res.status(500).json({ error: "Server crashed: " + err.message });
  }
}
