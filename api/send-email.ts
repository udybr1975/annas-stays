import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { booking, listing, guest } = req.body;

    // 1. Generate the HTML
    const emailHtml = generateBookingEmailHtml(booking, listing, guest);

    // 2. Send using the absolute simplest Resend settings
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev', // REMOVED "Anna's Stays" for testing
      to: [guest.email],
      subject: `Booking Confirmation: ${listing.name}`,
      html: emailHtml,
    });

    if (error) {
      console.error("RESEND_ERROR_DETAIL:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (err: any) {
    // This will show up in your Vercel Dashboard -> Logs
    console.error("VERCEL_FUNCTION_CRASH:", err.message);
    return res.status(500).json({ error: "Server crashed: " + err.message });
  }
}
