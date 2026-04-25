import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    
    // 1. Find the guest's email (handles Dashboard and Booking Form formats)
    const recipientEmail = body.to || body.guest?.email || body.guest?.em || body.email;

    if (!recipientEmail) {
      return res.status(400).json({ error: "No recipient email found." });
    }

    // 2. YOUR BRAND NEW SENDER
    const fromAddress = "Anna's Stays <info@anna-stays.fi>";

    // --- CASE A: MESSAGE FROM ADMIN DASHBOARD ---
    if (body.html) {
      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: [recipientEmail],
        subject: body.subject || "Message regarding your stay",
        html: body.html,
      });

      if (error) return res.status(400).json(error);
      return res.status(200).json({ success: true, data });
    }

    // --- CASE B: AUTOMATIC BOOKING CONFIRMATION ---
    const booking = body.booking || {};
    const listing = body.listing || body.apartment || {};
    const guest = body.guest || {};

    const safeGuest = {
      ...guest,
      first_name: guest.first_name || guest.fn || 'Guest',
      email: recipientEmail
    };

    const emailHtml = generateBookingEmailHtml(booking, listing, safeGuest);

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [recipientEmail],
      subject: `Booking Confirmed: ${listing.name || "Anna's Stays"}`,
      html: emailHtml,
    });

    if (error) return res.status(400).json(error);
    return res.status(200).json({ success: true, data });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
