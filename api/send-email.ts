import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { booking, listing, guest } = req.body;

    // Safety: Resend Free Tier MUST send to your verified email
    // This line forces it to your email while testing so it doesn't fail
    const targetEmail = "udy.bar.yosef@gmail.com"; 

    const emailHtml = generateBookingEmailHtml(booking, listing, guest);

    const data = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [targetEmail],
      subject: `Booking Confirmed: ${listing?.name || 'Anna Stays'}`,
      html: emailHtml,
    });

    if (data.error) {
      console.error("Resend Logic Error:", data.error);
      return res.status(400).json(data.error);
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("Vercel Crash Log:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
