import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ntfy-only mode: forward a push notification without sending email
  if (req.body?.ntfyOnly === true) {
    const { body, title, priority = 'default' } = req.body;
    if (!body) return res.status(400).json({ error: 'Missing body' });
    try {
      await fetch(process.env.NTFY_URL!, {
        method: 'POST',
        body: body,
        headers: { 'Title': title || "Anna's Stays", 'Priority': priority, 'Content-Type': 'text/plain' },
      });
      return res.status(200).json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
        const body = req.body || {};
        // Dynamically get the guest's email
      const recipientEmail = body.to || body.guest?.email || body.guest?.em || body.email;

      if (!recipientEmail) return res.status(400).json({ error: "No recipient found." });

      // NOW LIVE: Using your verified professional address
      const fromAddress = "Anna's Stays <info@anna-stays.fi>";

      const { data, error } = await resend.emails.send({
              from: fromAddress,
              to: [recipientEmail],
              reply_to: "info@anna-stays.fi",
              subject: body.subject || "Your Reservation at Anna's Stays",
              html: body.html || generateBookingEmailHtml(body.booking || {}, body.listing || {}, body.guest || {}),
      });

      if (error) {
              console.error("Resend Error:", error);
              return res.status(400).json(error);
      }

      return res.status(200).json({ success: true, data });

  } catch (err) {
        return res.status(500).json({ error: err.message });
  }
}
