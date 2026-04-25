import { Resend } from 'resend';
import { generateBookingEmailHtml } from '../src/lib/emailUtils.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    
    /**
     * 1. FIND THE RECIPIENT
     * This checks all possible locations for the guest's email address
     * (Supports both the Booking Form and the Admin Dashboard formats)
     */
    const recipientEmail = body.to || body.guest?.email || body.guest?.em || body.email;

    if (!recipientEmail) {
      console.error("Email Error: No recipient found in request body", body);
      return res.status(400).json({ error: "No recipient email found." });
    }

    /**
     * 2. DEFINE SENDER INFO
     * Now that DKIM is verified, we use your professional address.
     */
    const fromAddress = "Anna's Stays <info@anna-stays.fi>";
    const replyToAddress = "info@anna-stays.fi";

    // Check if this is a manual message from the Admin Dashboard
    const isDashboardMessage = !!body.html;

    /**
     * 3. SEND THE EMAIL
     */
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [recipientEmail],
      reply_to: replyToAddress,
      subject: body.subject || (isDashboardMessage ? "Message regarding your stay" : "Booking Confirmed!"),
      html: isDashboardMessage 
        ? body.html 
        : generateBookingEmailHtml(body.booking || {}, body.listing || {}, body.guest || {}),
    });

    if (error) {
      console.error("Resend API Error:", error);
      return res.status(400).json(error);
    }

    console.log("Email sent successfully to:", recipientEmail);
    return res.status(200).json({ success: true, data });

  } catch (err) {
    console.error("Server Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
