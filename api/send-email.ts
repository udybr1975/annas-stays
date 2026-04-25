import { Resend } from 'resend';
// Using .js extension for Vercel build compatibility
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};

    // 1. Identify if this is a manual message from Admin Dashboard
    // Dashboard sends 'to', 'subject', and 'html' directly
    if (body.html && body.to) {
      const { data, error } = await resend.emails.send({
        from: 'onboarding@resend.dev', 
        to: [body.to],
        subject: body.subject || "Message from Anna's Stays",
        html: body.html,
      });

      if (error) {
        console.error("Manual Send Error:", error);
        return res.status(400).json(error);
      }
      return res.status(200).json({ success: true, data });
    }

    // 2. Otherwise, treat as a Standard Booking Confirmation
    const booking = body.booking || body;
    const listing = body.listing || body.apartment || {};
    const guest = body.guest || body;

    const safeBooking = {
      ...booking,
      check_in: booking.check_in || booking.checkIn || 'TBD',
      check_out: booking.check_out || booking.checkOut || 'TBD',
      total_price: booking.total_price || booking.totalPrice || '0',
    };

    const safeGuest = {
      ...guest,
      first_name: guest.first_name || guest.fn || 'Guest',
      email: guest.email || guest.em || body.to
    };

    const safeListing = {
      ...listing,
      name: listing.name || "Anna's Stays",
      imgs: listing.imgs || listing.images || []
    };

    const emailHtml = generateBookingEmailHtml(safeBooking, safeListing, safeGuest);

    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [safeGuest.email],
      subject: `Booking Confirmed: ${safeListing.name}`,
      html: emailHtml,
    });

    if (error) {
      console.error("Confirmation Send Error:", error);
      return res.status(400).json(error);
    }

    return res.status(200).json({ success: true, data });

  } catch (err) {
    console.error("Critical API Failure:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
