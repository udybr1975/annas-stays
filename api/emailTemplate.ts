// Shared guest-facing email template helpers for Anna's Stays.
// Pure string utilities — no external dependencies, no Node.js imports.
// Palette mirrors the app: #2C2C2A (text) · #3D4F3E (forest) · #5C7A5C (sage)
//                          #E8E3DC (border) · #F7F4EF (bg block) · #7A756E (muted)

export function emailWrap(body: string): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:20px 0;background:#F7F4EF;">' +
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#2C2C2A;max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E3DC;">' +
    // ── Header ──
    '<div style="padding:28px 40px 24px;border-bottom:1px solid #E8E3DC;">' +
    '<p style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:0;letter-spacing:0.04em;color:#2C2C2A;">Anna\'s Stays</p>' +
    '<p style="font-size:10px;color:#7A756E;margin:5px 0 0;letter-spacing:0.2em;text-transform:uppercase;">Helsinki</p>' +
    '</div>' +
    // ── Body ──
    '<div style="padding:40px;">' + body + '</div>' +
    // ── Footer ──
    '<div style="padding:18px 40px;border-top:1px solid #E8E3DC;background:#F7F4EF;text-align:center;">' +
    '<p style="font-size:11px;color:#7A756E;margin:0;">' +
    'Anna\'s Stays &middot; Helsinki &middot; ' +
    '<a href="mailto:info@anna-stays.fi" style="color:#7A756E;text-decoration:none;">info@anna-stays.fi</a>' +
    '</p>' +
    '</div>' +
    '</div></body></html>'
  );
}

// Outlined "Manage Your Booking" button — secondary action, appears in all emails.
export function manageButton(url: string): string {
  return (
    '<div style="text-align:center;margin:36px 0 8px;">' +
    '<a href="' + url + '" style="display:inline-block;padding:13px 30px;border:1.5px solid #3D4F3E;color:#3D4F3E;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;">' +
    'Manage Your Booking &rarr;' +
    '</a>' +
    '</div>'
  );
}

// Two-column summary table — label (muted caps) + value (Georgia serif).
export function bookingTable(rows: [string, string][]): string {
  return (
    '<table style="width:100%;border-collapse:collapse;margin:24px 0;">' +
    rows.map(([label, value]) =>
      '<tr style="border-bottom:1px solid #E8E3DC;">' +
      '<td style="padding:11px 10px 11px 0;color:#7A756E;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;width:36%;vertical-align:top;">' + label + '</td>' +
      '<td style="padding:11px 0;font-family:Georgia,serif;font-size:14px;color:#2C2C2A;">' + value + '</td>' +
      '</tr>'
    ).join('') +
    '</table>'
  );
}

// Entry-codes notice block included in all confirmation emails.
export function entryCodesNote(): string {
  return (
    '<div style="border:1px solid #E8E3DC;padding:15px 20px;margin:24px 0;background:#FFFFFF;">' +
    '<p style="font-size:12px;color:#2C2C2A;margin:0;line-height:1.6;">' +
    '<span style="font-family:Georgia,serif;">Entry codes</span> &mdash; ' +
    'Your personal door codes will be sent to this email address 24 hours before check-in.' +
    '</p>' +
    '</div>'
  );
}

// Italic Anna sign-off in sage green.
export function annaSignature(): string {
  return (
    '<p style="margin:32px 0 0;font-family:Georgia,serif;font-size:15px;color:#5C7A5C;font-style:italic;">— Anna</p>'
  );
}

// "This Week in Helsinki" button — links back to the site with the events popup open.
export function helsinkiButton(): string {
  return (
    '<div style="text-align:center;margin:8px 0 8px;">' +
    '<a href="https://anna-stays.fi/?openHelsinki=true" style="display:inline-block;padding:13px 30px;border:1.5px solid #3D4F3E;color:#3D4F3E;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;">' +
    'This Week in Helsinki &rarr;' +
    '</a>' +
    '</div>'
  );
}

// Full-bleed hero image placed first in the email body (cancels 40px body padding).
export function heroImage(url: string): string {
  if (!url) return '';
  return (
    '<div style="margin:-40px -40px 28px;line-height:0;overflow:hidden;">' +
    '<img src="' + url + '" alt="" style="width:100%;max-height:280px;object-fit:cover;display:block;border:0;" />' +
    '</div>'
  );
}

// Personal note from Anna — thin divider above, Georgia italic, sage green.
export function annaMessage(text: string): string {
  return (
    '<div style="border-top:1px solid #E8E3DC;margin:28px 0 24px;padding-top:24px;">' +
    '<p style="font-family:Georgia,serif;font-size:14px;color:#5C7A5C;font-style:italic;margin:0;line-height:1.8;">' +
    text +
    '</p>' +
    '</div>'
  );
}

// Public apartment details block for confirmation emails.
// apt: row from apartments table  (needs name, neighborhood, tags)
// details: rows from apartment_details where is_private = false
export function apartmentBlock(
  apt: { name?: string; neighborhood?: string; tags?: string[] },
  details: { category: string; content: string }[],
): string {
  const name = apt.name || '';
  const neighbourhood = apt.neighborhood || '';
  const tags: string[] = apt.tags || [];

  // ── Extract check-in / check-out display values ──
  let checkIn = '';
  let checkOut = '';

  for (const d of details) {
    const cat = d.category.toLowerCase().trim();
    const text = d.content.trim();
    const low = text.toLowerCase();

    // Skip pure method entries that carry no time
    const isMethod = /^self\s+check[\s-]?in$|^in\s+person/i.test(text);
    if (isMethod) continue;

    const looksLikeCheckIn = /3\s*pm|15:?00|check[\s-]?in.{0,20}\d|from\s+\d/i.test(text);
    const looksLikeCheckOut = /11\s*am|11:?00|check[\s-]?out.{0,20}\d|by\s+\d/i.test(text);

    if (!checkIn) {
      if (cat === 'check-in' && looksLikeCheckIn) checkIn = text;
      if (cat === 'check-in & check-out' && looksLikeCheckIn) checkIn = text;
      if ((cat === 'schedule' || cat === 'timing') && looksLikeCheckIn) checkIn = text;
    }
    if (!checkOut) {
      if (cat === 'check-out' && looksLikeCheckOut) checkOut = text;
      if (cat === 'check-in & check-out' && looksLikeCheckOut) checkOut = text;
      if ((cat === 'schedule' || cat === 'timing') && looksLikeCheckOut) checkOut = text;
    }
  }
  if (!checkIn) checkIn = '15:00 (3 PM)';
  if (!checkOut) checkOut = '11:00 (11 AM)';

  // ── Extract house rules ──
  const ruleLines: string[] = [];
  for (const d of details) {
    const cat = d.category.toLowerCase().trim();
    if (cat === 'house rules' || cat === 'policies') {
      ruleLines.push(d.content.trim());
    }
  }

  // ── Build HTML ──
  let html =
    '<div style="background:#F7F4EF;padding:24px 28px;margin:28px 0;">' +
    '<p style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#7A756E;margin:0 0 14px;">Your Apartment</p>' +
    '<p style="font-family:Georgia,serif;font-size:17px;font-weight:normal;margin:0 0 3px;color:#2C2C2A;">' + name + '</p>';

  if (neighbourhood) {
    html += '<p style="font-size:12px;color:#7A756E;margin:0 0 18px;">' + neighbourhood + '</p>';
  } else {
    html += '<p style="margin:0 0 18px;"></p>';
  }

  // Check-in / check-out side by side using table (email-safe)
  html +=
    '<table style="width:100%;border-collapse:collapse;margin-bottom:18px;">' +
    '<tr>' +
    '<td style="padding:0;vertical-align:top;width:48%;">' +
    '<p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#7A756E;margin:0 0 4px;">Check-in</p>' +
    '<p style="font-family:Georgia,serif;font-size:13px;margin:0;color:#2C2C2A;">' + checkIn + '</p>' +
    '</td>' +
    '<td style="padding:0;vertical-align:top;width:4%;"><div style="width:1px;height:40px;background:#E8E3DC;margin:0 auto;"></div></td>' +
    '<td style="padding:0;vertical-align:top;width:48%;">' +
    '<p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#7A756E;margin:0 0 4px;">Check-out</p>' +
    '<p style="font-family:Georgia,serif;font-size:13px;margin:0;color:#2C2C2A;">' + checkOut + '</p>' +
    '</td>' +
    '</tr>' +
    '</table>';

  // Amenities from tags
  if (tags.length > 0) {
    html +=
      '<p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#7A756E;margin:0 0 5px;">Amenities</p>' +
      '<p style="font-size:12px;color:#2C2C2A;margin:0 0 16px;line-height:1.8;">' +
      tags.slice(0, 8).join(' &middot; ') +
      '</p>';
  }

  // House rules
  if (ruleLines.length > 0) {
    html +=
      '<p style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#7A756E;margin:0 0 5px;">House Rules</p>' +
      '<ul style="margin:0;padding-left:16px;font-size:12px;line-height:1.9;color:#2C2C2A;">' +
      ruleLines.map(r => '<li>' + r + '</li>').join('') +
      '</ul>';
  }

  html += '</div>';
  return html;
}
