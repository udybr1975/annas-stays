import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils';

// This connects to the secret key you added to Vercel
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  // Only allow the "Book" button (POST) to trigger this
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { booking, listing, guest } = req.body;

    // 1. Generate the beautiful HTML using your fixed emailUtils
    const emailHtml = generateBookingEmailHtml(booking, listing, guest);

    // 2. Send it using Resend
    const { data, error } = await resend.emails.send({
      from: "Anna's Stays <onboarding@resend.dev>",
      to: [guest.email],
      subject: `Booking Confirmed: ${listing.name}`,
      html: emailHtml,
    });

    if (error) {
      return res.status(400).json(error);
    }

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error("Resend API Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
