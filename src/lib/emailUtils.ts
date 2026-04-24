export function generateBookingEmailHtml(booking: any, listing: any, guest: any) {
  const nights = booking.check_in && booking.check_out 
    ? Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Technical Fix: Hardcoded URL because 'window' is not available on the server
  const siteUrl = "https://udybr1975-annas-stays.vercel.app";
  const manageUrl = `${siteUrl}/manage-booking/${booking.id}?email=${encodeURIComponent(guest.email || '')}`;
  
  const headerImg = listing.imgs?.[0] || "https://picsum.photos/seed/helsinki/1200/800";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2C2C2A; background-color: #F7F4EF; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #ffffff; border: 1px solid #E8E3DC; }
        .header-img { width: 100%; height: 200px; object-fit: cover; } /* Fixed CSS property */
        .content { padding: 40px; }
        .welcome-box { background: #FAF9F6; border-left: 4px solid #B09B89; padding: 30px; margin-bottom: 30px; }
        .serif { font-family: Georgia, serif; }
        .details-grid { display: table; width: 100%; margin-bottom: 30px; }
        .details-col { display: table-cell; width: 50%; vertical-align: top; }
        .label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #7A756E; margin-bottom: 5px; }
        .value { font-size: 14px; margin-bottom: 15px; }
        .price { font-size: 24px; color: #3D4F3E; }
        .footer { background: #2C2C2A; color: #C8B89A; padding: 20px; text-align: center; font-size: 10px; letter-spacing: 3px; text-transform: uppercase; }
        .policy { font-size: 12px; color: #7A756E; font-style: italic; border-top: 1px solid #E8E3DC; padding-top: 20px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <img src="${headerImg}" class="header-img" />
        <div class="content">
          <div class="welcome-box">
            <p class="serif" style="font-size: 18px; font-style: italic; margin-bottom: 20px;">Dear ${guest.first_name},</p>
            <p class="serif" style="font-size: 16px; line-height: 1.6; color: #7A756E; font-style: italic;">
              ${booking.guest_count === 2 
                ? "I'm so glad both of you chose my studio for your stay." 
                : "I am so thrilled you'll be staying with us at "
              }
              <strong style="color: #2C2C2A; font-style: normal;">${listing.name}</strong>. 
              Helsinki is a magical city, and we've prepared everything to make your visit truly special. 
              We'll send your personal entry codes 24 hours before you arrive.
            </p>
            <p style="font-family: cursive; font-size: 24px; color: #B09B89; margin-top: 20px; margin-bottom: 0;">Anna Humalainen</p>
            <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #7A756E;">Host</p>
          </div>

          <div class="details-grid">
            <div class="details-col">
              <div class="label">Dates</div>
              <div class="value serif">${booking.check_in} — ${booking.check_out}</div>
              <div class="label">Guests</div>
              <div class="value serif">${booking.guest_count} ${booking.guest_count === 1 ? "Guest" : "Guests"}</div>
            </div>
            <div class="details-col">
              <div class="label">Reference</div>
              <div class="value" style="font-family: monospace; font-weight: bold;">${booking.reference_number || `RES-${booking.id?.slice(0, 8).toUpperCase()}`}</div>
              <div class="label">Total Paid</div>
              <div class="value price serif">€${booking.total_price}</div>
            </div>
          </div>

          <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #FAF9F6; border: 1px solid #E8E3DC;">
            <p style="font-size: 14px; color: #2C2C2A; line-height: 1.5; margin: 0;">
              To manage your booking, please visit the main page of <strong>Anna's Stays</strong> and click on the <strong>Find My Booking</strong> tab.
            </p>
          </div>

          <div class="policy">
            <p><strong>Refund Policy:</strong> Full refund for cancellations made within 48 hours of booking, if the check-in date is at least 14 days away. 50% refund for cancellations made at least 7 days before check-in. No refunds for cancellations made within 7 days of check-in.</p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <p class="label">Host Contact</p>
            <p style="font-size: 12px; color: #7A756E;">+358 44 2400 228 | anna.humalainen@gmail.com</p>
          </div>
        </div>
        <div class="footer">
          Anna's Stays · Helsinki
        </div>
      </div>
    </body>
    </html>
  `;
}
