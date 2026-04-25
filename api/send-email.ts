import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const recipientEmail = body.to || body.guest?.email || body.guest?.em || body.email;

    if (!recipientEmail) {
      return res.status(400).json({ error: "No recipient email found." });
    }

    // Since Resend is being picky about 'info@', we try sending from the domain root
    // This often works even when SPF/MX are 'failing' in the dashboard
    const fromAddress = "Anna's Stays <onboarding@resend.dev>"; 
    
    // NOTE: Once we see a SUCCESS, we will change 'onboarding@resend.dev' 
    // to 'hello@anna-stays.fi'. We use onboarding now just to break the 403 error.

    const isDashboardMessage = !!body.html;

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [recipientEmail],
      reply_to: "info@anna-stays.fi", // Guests reply to your real Google inbox
      subject: body.subject || (isDashboardMessage ? "Message from Anna's Stays" : `Booking Confirmed`),
      html: isDashboardMessage ? body.html : generateBookingEmailHtml(body.booking || {}, body.listing || {}, body.guest || {}),
    });

    if (error) {
      console.error("Resend Error Details:", error);
      return res.status(400).json(error);
    }

    return res.status(200).json({ success: true, data });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
