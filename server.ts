import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Stripe from "stripe";
import webhookHandler from "./api/webhook.js";
import cancelBookingHandler from "./api/cancel-booking.js";
import approveBookingHandler from "./api/approve-booking.js";
import declineBookingHandler from "./api/decline-booking.js";
import notifyHandler from "./api/notify.js";
import verifyBookingHandler from "./api/verify-booking.js";
import instagramCaptionHandler from "./api/instagram-caption.js";
import requestUgcRefundHandler from "./api/request-ugc-refund.js";
import approveUgcRefundHandler from "./api/approve-ugc-refund.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // ─── Stripe webhook MUST come before express.json() ─────────────────────
  // api/webhook.ts uses getRawBody(req) which reads the raw stream.
  app.post("/api/webhook", webhookHandler);

  // ─── JSON middleware for all other routes ────────────────────────────────
  app.use(express.json({ limit: '10mb' }));

  // ─── API routes (Vercel serverless functions, registered here for local dev)
  app.post("/api/cancel-booking", cancelBookingHandler);
  app.post("/api/approve-booking", approveBookingHandler);
  app.post("/api/decline-booking", declineBookingHandler);
  app.post("/api/notify", notifyHandler);
  app.post("/api/verify-booking", verifyBookingHandler);
  app.post("/api/instagram-caption", instagramCaptionHandler);
  app.post("/api/request-ugc-refund", requestUgcRefundHandler);
  app.post("/api/approve-ugc-refund", approveUgcRefundHandler);

  // ─── Stripe checkout session ─────────────────────────────────────────────
  app.post("/api/create-checkout-session", async (req, res) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return res.status(500).json({ error: "Stripe not configured" });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" as any });
    const { booking, listing, guest, isInstantBook } = req.body;

    if (!booking?.referenceNumber || !listing?.id || !guest?.email) {
      return res.status(400).json({ error: "Missing required booking information." });
    }

    const origin = req.headers.origin || "https://anna-stays.fi";

    const stripeImages = process.env.ANNA_STAYS_LOGO_URL ? [process.env.ANNA_STAYS_LOGO_URL] : [];

    try {
      if (isInstantBook) {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: guest.email,
          line_items: [{
            price_data: {
              currency: "eur",
              product_data: {
                name: listing.name,
                description: `${booking.nights} night stay · ${booking.checkIn} to ${booking.checkOut}`,
                images: stripeImages,
              },
              unit_amount: Math.round(booking.totalPrice * 100),
            },
            quantity: 1,
          }],
          success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}&ref=${booking.referenceNumber}`,
          cancel_url: `${origin}/`,
          metadata: {
            referenceNumber: String(booking.referenceNumber),
            apartmentId: String(listing.id),
            apartmentName: String(listing.name),
            guestFirstName: String(guest.firstName),
            guestLastName: String(guest.lastName),
            guestEmail: String(guest.email),
            checkIn: String(booking.checkIn),
            checkOut: String(booking.checkOut),
            guestCount: String(booking.guestCount),
            totalPrice: String(booking.totalPrice),
            car: String(booking.car || false),
            transfer: String(booking.transfer || false),
            message: String(booking.message || ""),
            isInstant: "true",
          },
        });
        return res.status(200).json({ url: session.url });
      } else {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "setup",
          customer_email: guest.email,
          success_url: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}&ref=${booking.referenceNumber}&pending=true`,
          cancel_url: `${origin}/`,
          metadata: {
            referenceNumber: String(booking.referenceNumber),
            apartmentId: String(listing.id),
            apartmentName: String(listing.name),
            guestFirstName: String(guest.firstName),
            guestLastName: String(guest.lastName),
            guestEmail: String(guest.email),
            checkIn: String(booking.checkIn),
            checkOut: String(booking.checkOut),
            guestCount: String(booking.guestCount),
            totalPrice: String(booking.totalPrice),
            car: String(booking.car || false),
            transfer: String(booking.transfer || false),
            message: String(booking.message || ""),
            isInstant: "false",
          },
        });
        return res.status(200).json({ url: session.url });
      }
    } catch (err: any) {
      console.error("Stripe session error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Email route ─────────────────────────────────────────────────────────
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html, replyTo } = req.body;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: "No Resend API key" });

    try {
      const payload: Record<string, any> = {
        from: "Anna's Stays <info@anna-stays.fi>",
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      };
      if (replyTo) payload.reply_to = replyTo;

      const response = await fetch((process.env.RESEND_API_URL ?? 'https://api.resend.com') + '/emails', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok) {
        res.json({ success: true, data });
      } else {
        console.error("Resend API Error:", data);
        res.status(response.status).json({ success: false, error: data });
      }
    } catch (error: any) {
      console.error("Server Email Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── Vite / static serving ───────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
