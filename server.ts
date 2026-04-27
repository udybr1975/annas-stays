import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // ─── Stripe webhook MUST come before express.json() ─────────────────────
  // Stripe requires the raw body to verify the signature
  app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
      console.error("Webhook: Missing env vars");
      return res.status(500).send("Server configuration error");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" as any });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const sig = req.headers["stripe-signature"];

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig!, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type !== "checkout.session.completed") {
      return res.status(200).json({ received: true, ignored: true });
    }

    const session = event.data.object as any;
    const m = session.metadata;

    if (!m?.referenceNumber || !m?.apartmentId || !m?.guestEmail) {
      console.error("Webhook: Missing metadata");
      return res.status(400).send("Missing metadata");
    }

    // Idempotency: skip if this reference already exists
    const { data: existing } = await supabase
      .from("bookings")
      .select("id")
      .eq("reference_number", m.referenceNumber)
      .maybeSingle();

    if (existing) {
      console.log(`Webhook: ${m.referenceNumber} already exists — skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Save guest
    const { data: guestData, error: guestError } = await supabase
      .from("guests")
      .insert({
        email: m.guestEmail.toLowerCase().trim(),
        first_name: m.guestFirstName || "",
        last_name: m.guestLastName || "",
      })
      .select("id")
      .single();

    if (guestError || !guestData?.id) {
      console.error("Webhook: Failed to save guest:", guestError?.message);
      return res.status(500).send("Failed to save guest");
    }

    // Save booking
    const isInstant = m.isInstant === "true";
    const status = isInstant ? "confirmed" : "pending";
    const setupIntentId = isInstant ? null : session.setup_intent || null;

    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        apartment_id: m.apartmentId,
        guest_id: guestData.id,
        check_in: m.checkIn,
        check_out: m.checkOut,
        total_price: parseFloat(m.totalPrice),
        guest_count: parseInt(m.guestCount, 10),
        status: status,
        reference_number: m.referenceNumber,
        stripe_session_id: session.id,
        stripe_setup_intent_id: setupIntentId,
        admin_needs_attention: true,
        ...(m.message ? { notes: m.message } : {}),
      })
      .select("id")
      .single();

    if (bookingError || !bookingData?.id) {
      console.error("Webhook: Failed to save booking:", bookingError?.message);
      return res.status(500).send("Failed to save booking");
    }

    console.log(`Webhook: Booking ${m.referenceNumber} saved as '${status}'`);

    // Send confirmation email
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const subject = isInstant
          ? `Booking Confirmed — #${m.referenceNumber} | Anna's Stays`
          : `Reservation Request Received — #${m.referenceNumber} | Anna's Stays`;

        const emailHtml = isInstant
          ? `<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;">
              <h2 style="font-weight:normal;font-size:1.5rem;border-bottom:1px solid #E8E3DC;padding-bottom:12px;margin-bottom:24px;">Booking Confirmed ✓</h2>
              <p>Dear ${m.guestFirstName},</p>
              <p>Your payment has been received and your stay at <strong>${m.apartmentName}</strong> is confirmed. We are so excited to welcome you to Helsinki!</p>
              <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:0.9rem;">
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Reference</td><td style="padding:10px 0;font-weight:bold;">#${m.referenceNumber}</td></tr>
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Apartment</td><td style="padding:10px 0;">${m.apartmentName}</td></tr>
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Check-in</td><td style="padding:10px 0;">${m.checkIn}</td></tr>
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Check-out</td><td style="padding:10px 0;">${m.checkOut}</td></tr>
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Guests</td><td style="padding:10px 0;">${m.guestCount}</td></tr>
                <tr><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Total Paid</td><td style="padding:10px 0;font-size:1.2rem;font-weight:bold;">€${m.totalPrice}</td></tr>
              </table>
              <p>We will send your personal entry codes 24 hours before check-in.</p>
              <p>Manage your booking at <a href="https://anna-stays.fi/find-booking" style="color:#5C7A5C;">anna-stays.fi/find-booking</a></p>
              <p style="margin-top:32px;font-style:italic;color:#5C7A5C;">— Anna Humalainen, Host</p>
            </div>`
          : `<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;">
              <h2 style="font-weight:normal;font-size:1.5rem;border-bottom:1px solid #E8E3DC;padding-bottom:12px;margin-bottom:24px;">Reservation Request Received</h2>
              <p>Dear ${m.guestFirstName},</p>
              <p>Thank you for your interest in <strong>${m.apartmentName}</strong>. Your card has been saved securely — <strong>you will only be charged if your request is approved.</strong></p>
              <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:0.9rem;">
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Request Reference</td><td style="padding:10px 0;font-weight:bold;">#${m.referenceNumber}</td></tr>
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Apartment</td><td style="padding:10px 0;">${m.apartmentName}</td></tr>
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Check-in</td><td style="padding:10px 0;">${m.checkIn}</td></tr>
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Check-out</td><td style="padding:10px 0;">${m.checkOut}</td></tr>
                <tr style="border-bottom:1px solid #E8E3DC;"><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Guests</td><td style="padding:10px 0;">${m.guestCount}</td></tr>
                <tr><td style="padding:10px 0;color:#7A756E;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.1em;">Total if Approved</td><td style="padding:10px 0;font-size:1.1rem;">€${m.totalPrice}</td></tr>
              </table>
              <p>We will review your request and notify you within a few hours.</p>
              <p>Check status at <a href="https://anna-stays.fi/find-booking" style="color:#5C7A5C;">anna-stays.fi/find-booking</a></p>
              <p style="margin-top:32px;font-style:italic;color:#5C7A5C;">— Anna Humalainen, Host</p>
            </div>`;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "Anna from Helsinki <onboarding@resend.dev>",
            to: [m.guestEmail],
            subject,
            html: emailHtml,
          }),
        });
        console.log(`Email sent to ${m.guestEmail}`);
      } catch (emailErr) {
        console.error("Email failed (non-fatal):", emailErr);
      }
    }

    // ntfy push notification
    const ntfyTitle = isInstant ? "New Confirmed Booking 🎉" : "New Booking Request 📩";
    const ntfyBody = isInstant
      ? `💰 ${m.guestFirstName} ${m.guestLastName} | ${m.apartmentName} | ${m.checkIn} → ${m.checkOut} | ${m.guestCount} guest(s) | €${m.totalPrice}`
      : `📋 ${m.guestFirstName} ${m.guestLastName} wants to book ${m.apartmentName} | ${m.checkIn} → ${m.checkOut} | Card saved, awaiting your approval`;

    fetch("https://ntfy.sh/annas-stays-helsinki-99", {
      method: "POST",
      body: ntfyBody,
      headers: {
        Title: ntfyTitle,
        "X-Tags": isInstant ? "moneybag,tada" : "envelope,eyes",
        Priority: "high",
        Click: "https://ais-dev-rnwdx67jyuj5ixxi5uwbj4-728456909831.europe-west2.run.app",
      },
    }).catch(console.error);

    return res.status(200).json({ received: true });
  });

  // ─── JSON middleware for all other routes ────────────────────────────────
  app.use(express.json());

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
    const { to, subject, html } = req.body;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: "No Resend API key" });

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: "Anna from Helsinki <onboarding@resend.dev>",
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
        }),
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
