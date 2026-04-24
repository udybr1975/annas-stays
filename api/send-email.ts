import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // We pull the data out and provide fallbacks so it never says "undefined"
    const { booking = {}, listing = {}, guest = {} } = req.body;

    // Safety check: If the frontend sent 'checkIn' instead of 'check_in', we fix it here
    const normalizedBooking = {
      ...booking,
      check_in: booking.check_in || booking.checkIn || 'TBD',
      check_out: booking.check_out || booking.checkOut || 'TBD',
      total_price: booking.total_price || booking.totalPrice || '0',
      guest_count: booking.guest_count || booking.guests || 1
    };

    const normalizedGuest = {
      ...guest,
      first_name: guest.first_name || guest.name?.split(' ')[0] || 'Guest'
    };

    // Now we call the email generator with the safe data
    const emailHtml = generateBookingEmailHtml(normalizedBooking, listing, normalizedGuest);

    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [guest.email || 'anna.humalainen@gmail.com'], // Fallback to your email for testing
      subject: `Booking Confirmed: ${listing.name || 'Anna\'s Stays'}`,
      html: emailHtml,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error("SERVER_CRASH_LOG:", err.message);
    return res.status(500).json({ error: "Server crashed: " + err.message });
  }
}
