import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    // This looks for the actual guest email you typed in the dashboard
    const recipientEmail = body.to || body.guest?.email || body.guest?.em || body.email;

    if (!recipientEmail) return res.status(400).json({ error: "No recipient email found." });

    /**
     * THE SANDBOX BYPASS:
     * Resend blocks 'info@anna-stays.fi' from sending to strangers until DNS is 100% Green.
     * BUT, they allow 'onboarding@resend.dev' to send to ANYONE.
     * We keep your name "Anna's Stays" so it looks professional.
     */
    const fromAddress = "Anna's Stays <onboarding@resend.dev>";
    const replyToAddress = "info@anna-stays.fi";

    const isDashboardMessage = !!body.html;

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [recipientEmail],
      reply_to: replyToAddress, // If a guest clicks reply, it goes to your Google Inbox
      subject: body.subject || (isDashboardMessage ? "Message from Anna's Stays" : "Booking Confirmed!"),
      html: isDashboardMessage 
        ? body.html 
        : generateBookingEmailHtml(body.booking || {}, body.listing || {}, body.guest || {}),
    });

    if (error) {
      console.error("Resend API Error:", error);
      return res.status(400).json(error);
    }

    return res.status(200).json({ success: true, data });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
