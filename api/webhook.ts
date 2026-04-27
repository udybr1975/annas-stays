import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const config = { api: { bodyParser: false } };

async function getRawBody(readable: any) {
    const chunks: any[] = [];
    for await (const chunk of readable) { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); }
    return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
    const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const resend = new Resend(process.env.RESEND_API_KEY);

  const buf = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  try {
        const event = stripe.webhooks.constructEvent(buf, sig!, webhookSecret!);

      if (event.type === 'checkout.session.completed') {
              const session = event.data.object as Stripe.Checkout.Session;
              const m = session.metadata;
              if (!m) return res.status(400).send('No metadata found');

          // Generate the RES- format reference
          const ref = `RES-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

          // TABLE 1: Update 'guests'
          const { data: guestData, error: gErr } = await supabase
                .from('guests')
                .upsert({
                            email: session.customer_details?.email?.toLowerCase(),
                            first_name: m.guestFirstName,
                            last_name: m.guestLastName
                }, { onConflict: 'email' }).select('id').single();

          if (gErr) throw gErr;

          // TABLE 2: Update 'bookings'
          const { error: bErr } = await supabase.from('bookings').insert({
                    apartment_id: m.apartmentId,
                    guest_id: guestData.id,
                    check_in: m.checkIn,
                    check_out: m.checkOut,
                    total_price: parseFloat(m.totalPrice),
                    status: m.isInstant === 'true' ? 'confirmed' : 'pending',
                    booking_reference: ref,
                    stripe_session_id: session.id,
                    guest_count: parseInt(m.guestCount)
          });

          if (bErr) throw bErr;

          // Send confirmation email to guest
          const guestEmail = session.customer_details?.email;
              if (guestEmail) {
                        const emailHtml = `<!DOCTYPE html>
                        <html>
                        <head><meta charset="utf-8"><style>
                        body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#2C2C2A;background:#F7F4EF;margin:0;padding:0}
                        .container{max-width:600px;margin:20px auto;background:#fff;border:1px solid #E8E3DC}
                        .content{padding:40px}
                        .welcome-box{background:#FAF9F6;border-left:4px solid #B09B89;padding:30px;margin-bottom:30px}
                        .label{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#7A756E;margin-bottom:5px}
                        .value{font-size:14px;margin-bottom:15px}
                        .footer{background:#2C2C2A;color:#C8B89A;padding:20px;text-align:center;font-size:10px;letter-spacing:3px;text-transform:uppercase}
                        .policy{font-size:12px;color:#7A756E;font-style:italic;border-top:1px solid #E8E3DC;padding-top:20px;margin-top:30px}
                        </style></head>
                        <body><div class="container"><div class="content">
                        <div class="welcome-box">
                        <p style="font-family:Georgia,serif;font-size:18px;font-style:italic">Dear ${m.guestFirstName},</p>
                        <p style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#7A756E;font-style:italic">
                        Thank you for choosing Anna's Stays in Helsinki! We have prepared everything to make your stay truly special.
                        We'll send your personal entry codes 24 hours before you arrive.</p>
                        <p style="font-family:cursive;font-size:24px;color:#B09B89;margin-top:20px">Anna Humalainen</p>
                        <p style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#7A756E">Host</p>
                        </div>
                        <table width="100%" style="margin-bottom:30px">
                        <tr>
                        <td style="width:50%;vertical-align:top">
                        <div class="label">Dates</div><div class="value">${m.checkIn} — ${m.checkOut}</div>
                        <div class="label">Guests</div><div class="value">${m.guestCount} ${parseInt(m.guestCount) === 1 ? 'Guest' : 'Guests'}</div>
                        </td>
                        <td style="width:50%;vertical-align:top">
                        <div class="label">Reference</div><div class="value" style="font-family:monospace;font-weight:bold">${ref}</div>
                        <div class="label">Total Paid</div><div class="value" style="font-size:24px;color:#3D4F3E">€${m.totalPrice}</div>
                        </td>
                        </tr>
                        </table>
                        ${m.isInstant !== 'true' ? '<div style="background:#FFF8E1;border:1px solid #FFD54F;padding:15px;margin-bottom:20px;border-radius:4px"><p style="margin:0;font-size:14px;color:#F57F17"><strong>Pending Booking:</strong> Your reservation is pending host approval. You will be charged only after the host confirms your booking.</p></div>' : ''}
                        <div class="policy"><p><strong>Refund Policy:</strong> Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds within 7 days of check-in.</p></div>
                        <div style="text-align:center;margin-top:30px"><p class="label">Host Contact</p>
                        <p style="font-size:12px;color:#7A756E">+358 44 2400 228 | anna.humalainen@gmail.com</p></div>
                        </div><div class="footer">Anna's Stays · Helsinki</div></div></body></html>`;

                await resend.emails.send({
                            from: "Anna's Stays <info@anna-stays.fi>",
                            to: [guestEmail],
                            reply_to: 'info@anna-stays.fi',
                            subject: `Booking Confirmation – Ref: ${ref}`,
                            html: emailHtml,
                });
              }

          // Notification to your phone
          await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
                    method: 'POST',
                    body: `New Booking! 🏠 ${m.guestFirstName} ${m.guestLastName} reserved apt ${m.apartmentId}. Dates: ${m.checkIn} to ${m.checkOut}. Guests: ${m.guestCount}. Total: €${m.totalPrice}. Ref: ${ref}. Status: ${m.isInstant === 'true' ? 'CONFIRMED' : 'PENDING'}`,
                    headers: { 'Title': "Anna's Stays: New Reservation", 'Tags': 'house,euro' }
          });
      }
        return res.status(200).json({ received: true });
  } catch (err: any) {
        return res.status(400).send(`Error: ${err.message}`);
  }
}
