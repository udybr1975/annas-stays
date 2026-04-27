import { useState, useEffect } from "react";
import { C, LISTINGS } from "../constants";
import Calendar from "./Calendar";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import { supabase } from "../lib/supabase";
import { resolveImageUrl } from "../lib/imageUtils";
import { Info, RefreshCw, Check, Phone, Mail, FileText, Send } from "lucide-react";
import BookingEmailTemplate from "./BookingEmailTemplate";
import { generateBookingEmailHtml } from "../lib/emailUtils";

// Import Swiper styles
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/autoplay";

interface BookingModalProps {
  listing: any;
  onClose: () => void;
}

export default function BookingModal({ listing, onClose }: BookingModalProps) {
  const [step, setStep] = useState(1);
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [car, setCar] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [form, setForm] = useState({ fn: "", ln: "", em: "", card: "", exp: "", cvv: "", message: "" });
  const [done, setDone] = useState(false);
  const [specialPrices, setSpecialPrices] = useState<any[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingRef, setBookingRef] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState<number>(0);
  const [showEmailTemplate, setShowEmailTemplate] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ sent: boolean; error: boolean; email?: string }>({ sent: false, error: false });

  const [bookingStatus, setBookingStatus] = useState<'confirmed' | 'pending'>('confirmed');
  const [isInstantBook, setIsInstantBook] = useState<boolean>(true);

  useEffect(() => {
    fetchSpecialPrices();
    fetchBookedDates();
    fetchInstantBookStatus();
  }, [listing.id, refreshTrigger]);

  const fetchInstantBookStatus = async () => {
    const { data, error } = await supabase
      .from('apartments')
      .select('is_instant_book')
      .eq('id', listing.id)
      .single();
    
    if (!error && data) {
      setIsInstantBook(data.is_instant_book !== false);
    }
  };

  const fetchBookedDates = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('check_in, check_out')
      .eq('apartment_id', listing.id)
      .not('status', 'in', '("cancelled","declined")');

    if (error) {
      console.error("Error fetching booked dates:", error);
      return;
    }

    const dates: string[] = [];
    data.forEach(booking => {
      let curr = new Date(booking.check_in);
      const last = new Date(booking.check_out);
      while (curr < last) {
        dates.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
      }
    });
    setBookedDates(dates);
  };

  const fetchSpecialPrices = async () => {
    setPriceLoading(true);
    const { data, error } = await supabase
      .from("apartment_prices")
      .select("*")
      .eq("apartment_id", listing.id);
    
    if (error) {
      console.error("Error fetching special prices:", error);
    } else {
      setSpecialPrices(data || []);
    }
    setPriceLoading(false);
  };

  const handleReserve = async () => {
    console.log('DEBUG: Starting booking save...');
    
    // STEP 0: Generate Reference Number (Single Source of Truth)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const finalRef = `RES-${randomPart}`;
    setBookingRef(finalRef);

    if (!form.fn || !form.em) {
      alert("Please fill in name and email.");
      return;
    }

    const aptId = listing?.id;
    console.log('DEBUG: apartment_id:', aptId);
    if (!aptId) {
      alert("CRITICAL ERROR: Apartment ID is missing.");
      return;
    }

    // Final overlap check
    if (range.start && range.end) {
      let hasOverlap = false;
      let curr = new Date(range.start);
      const last = new Date(range.end);
      while (curr < last) {
        const checkStr = curr.toISOString().split('T')[0];
        if (bookedDates.includes(checkStr)) {
          hasOverlap = true;
          break;
        }
        curr.setDate(curr.getDate() + 1);
      }

      if (hasOverlap) {
        alert("Your selection includes dates that are already booked. Please choose a different range.");
        setRange({ start: null, end: null });
        setStep(1);
        return;
      }
    }

    setBookingLoading(true);
    try {
      // STEP 1: Create Guest (Always insert a new record to preserve name at time of booking)
      const { data: guestData, error: guestError } = await supabase
        .from('guests')
        .insert({
          email: String(form.em).trim().toLowerCase(),
          first_name: String(form.fn).trim(),
          last_name: String(form.ln).trim()
        })
        .select('id')
        .single();

      if (guestError) {
        console.error("Guest Save Error:", guestError);
        alert(`GUEST ERROR: ${guestError.message}`);
        setBookingLoading(false);
        return;
      }

      if (!guestData || !guestData.id) {
        alert("GUEST ERROR: Failed to retrieve guest ID.");
        setBookingLoading(false);
        return;
      }

      const guestId = guestData.id;

      const isInstant = isInstantBook;
      const status = isInstant ? 'confirmed' : 'pending';
      setBookingStatus(status);

      // STEP 3: Create Booking record in database
      // CRITICAL: We insert BEFORE sending the email.
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          apartment_id: String(aptId),
          check_in: String(range.start),
          check_out: String(range.end),
          total_price: Number(total),
          guest_id: String(guestId),
          guest_count: parseInt(String(guestCount), 10),
          status: status,
          reference_number: finalRef,
          admin_needs_attention: true,
          // We try to save the message if the column exists, otherwise it will just be in the notification
          ...(form.message ? { notes: form.message } : {}) 
        })
        .select('id')
        .single();

      if (bookingError) {
        alert('DATABASE ERROR: ' + bookingError.message);
        console.error(bookingError);
        setBookingLoading(false);
        return;
      }

      if (!bookingData || !bookingData.id) {
        alert("DATABASE ERROR: Booking was not created correctly.");
        setBookingLoading(false);
        return;
      }

      // STEP 4: Success State Update
      setBookingId(bookingData.id);
      setRefreshTrigger(prev => prev + 1);
      setStep(4); // Move to success UI
      setBookingLoading(false);

      // STEP 4.5: Send Real-Time Admin Notification (ntfy)
      // Non-blocking: we don't await this to ensure guest success UI isn't delayed.
      const guestName = `${form.fn} ${form.ln}`.trim();
      
      let ntfyTitle = "New Booking Received";
      let ntfyMessage = `💰 New Booking! Guest: ${guestName} (${guestCount} guests) | Apartment: ${listing.name} | Dates: ${range.start} - ${range.end} | Total: ${total}€ 🎉`;
      let ntfyTags = "moneybag,tada";

      if (status === 'pending') {
        ntfyTitle = "New Booking Request";
        ntfyMessage = `📩 ${guestName} is requesting to book ${listing.name}. Review in Admin.${form.message ? `\n\nMessage: "${form.message}"` : ""}`;
        ntfyTags = "envelope,eyes";
      }
      
      fetch("https://ntfy.sh/annas-stays-helsinki-99", {
        method: "POST",
        body: ntfyMessage,
        headers: {
          "Title": ntfyTitle,
          "Priority": "high",
          "X-Tags": ntfyTags,
          "Click": "https://ais-dev-rnwdx67jyuj5ixxi5uwbj4-728456909831.europe-west2.run.app"
        }
      }).catch(err => console.error("Ntfy Notification Error:", err));

      // STEP 5: Send Confirmation Email (Only after DB confirmation)
      // We don't 'await' this to keep the UI snappy, but it only triggers if DB insert worked.
      sendConfirmationEmail(bookingData.id, finalRef, form.em, form.fn, status);

      // Clear sensitive fields
      setForm(prev => ({ ...prev, em: "", card: "", exp: "", cvv: "" }));
      
    } catch (err: any) {
      console.error("Unexpected Booking Flow Error:", err);
      alert(`Unexpected Error: ${err.message || "Unknown error"}`);
      setBookingLoading(false);
    }
  };

  const getPriceForDate = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    
    // Priority 1: Special Event Price (check ranges)
    const special = specialPrices.find(p => {
      if (p.pricing_type === 'season') return false;
      const start = new Date(p.start_date || p.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(p.end_date || p.date);
      end.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    });
    
    if (special) return { 
      price: special.price_override || special.price, 
      type: "Event: " + (special.event_name || "Special Pricing") 
    };

    // Priority 2: Seasonal Pricing
    const season = specialPrices.find(p => {
      if (p.pricing_type !== 'season') return false;
      const start = new Date(p.start_date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(p.end_date);
      end.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    });

    if (season) {
      const day = date.getDay(); // 5 is Friday, 6 is Saturday
      const isWeekend = day === 5 || day === 6;
      return {
        price: isWeekend ? (season.weekend_price_override || season.price_override) : season.price_override,
        type: season.event_name + (isWeekend ? " (Weekend)" : " (Weekday)")
      };
    }

    // Priority 3: Base Price
    return { price: listing.price, type: "Base Rate" };
  };

  const getCurrentPrice = () => {
    const today = new Date().toISOString().split('T')[0];
    return getPriceForDate(today);
  };

  const sendConfirmationEmail = async (id: string, ref: string, email: string, firstName: string, status: string = 'confirmed') => {
    const IS_TESTING = true;
    const TEST_EMAIL = "udy.bar.yosef@gmail.com";

    try {
      let subject = `Reservation Confirmed: Your stay at ${listing.name}`;
      let html = generateBookingEmailHtml(
        { id, reference_number: ref, check_in: range.start, check_out: range.end, total_price: total, guest_count: guestCount },
        listing,
        { first_name: firstName, email: email }
      );

      if (status === 'pending') {
        subject = `We’ve received your reservation request - ${listing.name}`;
        html = `
          <div style="font-family: sans-serif; color: #2C2C2A; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E8E3DC;">
            <h2 style="font-weight: light; border-bottom: 1px solid #B09B89; padding-bottom: 10px;">Reservation Request Received</h2>
            <p>Dear ${firstName},</p>
            <p>Thank you for your interest in <strong>${listing.name}</strong>. This property requires host approval to ensure the best possible experience for our guests.</p>
            <p>We have received your request for <strong>${range.start}</strong> to <strong>${range.end}</strong> and are currently reviewing it. We appreciate your patience and will notify you as soon as the status is updated.</p>
            <p><strong>Reference Number:</strong> ${ref}</p>
            <p>If you wish to cancel your request, you can do so through the 'Find My Booking' section on our website using your email and the link provided in your browser.</p>
            <p>Regards,<br>The Anna's Stays Team</p>
          </div>
        `;
      }

      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: IS_TESTING ? TEST_EMAIL : email,
          subject: subject,
          html: html
        })
      });

      if (response.ok) {
        setEmailStatus({ sent: true, error: false, email });
        console.log("Email sent successfully via server");
      } else {
        const errorData = await response.json();
        console.error("Server Email Error:", errorData);
        setEmailStatus({ sent: false, error: true, email });
      }
    } catch (err: any) {
      console.error("Email Delivery Failed:", err);
      setEmailStatus({ sent: false, error: true, email });
    }
  };

  const calculateBreakdown = () => {
    if (!range.start || !range.end) return { nights: [], subtotal: 0, total: 0 };
    
    const start = new Date(range.start);
    const end = new Date(range.end);
    const nightsList = [];
    let subtotal = 0;

    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const { price, type } = getPriceForDate(dateStr);
      nightsList.push({ date: dateStr, price, type });
      subtotal += price;
    }

    const cleaningFee = listing.cleaningFee || 0;
    const carTotal = car ? nightsList.length * 55 : 0;
    const transferTotal = transfer ? 35 : 0;
    const total = subtotal + cleaningFee + carTotal + transferTotal;

    return { nights: nightsList, subtotal, total, cleaningFee, carTotal, transferTotal };
  };

  const breakdown = calculateBreakdown();
  const nights = breakdown.nights.length;
  const total = breakdown.total;
  const minStay = listing.minStay || 1;
  const isValidStay = nights >= minStay;

  const fi = (label: string, key: keyof typeof form, type?: string, ph?: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-[0.62rem] tracking-widest uppercase text-muted font-sans">{label}</label>
      <input
        type={type || "text"}
        placeholder={ph || ""}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="bg-cream border border-mist p-3 font-sans text-sm text-charcoal font-light outline-none w-full"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-[2000] flex items-center justify-center p-4">
      <div className={`bg-warm-white w-full ${step === 1 ? "max-w-[1000px]" : "max-w-[520px]"} max-h-[92vh] overflow-y-auto p-6 md:p-10 relative font-sans transition-all duration-300`}>
        <button onClick={onClose} className="absolute top-4 right-5 bg-none border-none text-xl cursor-pointer text-muted z-10">✕</button>
        {done ? (
          <div className="text-center py-8">
            <div className="font-serif text-[4rem] font-light text-forest leading-none mb-3">✓</div>
            <h2 className="font-serif text-3xl font-light mb-2">Booking confirmed</h2>
            <p className="text-sm text-muted leading-relaxed">Thank you, {form.fn}. A confirmation has been sent to {form.em}.</p>
            <div className="mt-5 p-6 bg-cream text-[0.82rem] text-muted leading-loose text-left">
              <span className="font-serif text-lg text-charcoal block mb-1">{listing.name}</span>
              {range.start} — {range.end}<br />{nights} nights · €{Math.round(breakdown.subtotal / nights)}/night avg
              {breakdown.cleaningFee > 0 && <div className="text-xs text-muted mt-1">+ €{breakdown.cleaningFee} cleaning fee</div>}
              <div className="border-t border-mist mt-2.5 pt-2.5 font-serif text-xl text-charcoal">Total: €{total}</div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex gap-1.5 mb-7 max-w-[440px] mx-auto">
              {["Details", "Extras", "Payment"].map((l, i) => (
                <div key={l} className="flex-1">
                  <div className={`h-0.5 mb-1 ${step > i + 1 ? "bg-clay" : step === i + 1 ? "bg-forest" : "bg-mist"}`} />
                  <span className={`text-[0.6rem] tracking-widest uppercase font-sans ${step === i + 1 ? "text-forest" : "text-muted"}`}>{l}</span>
                </div>
              ))}
            </div>

            {step === 1 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Left Side: Apartment Details */}
                <div className="flex flex-col gap-6">
                  <div className="w-full h-[300px] md:h-[450px] overflow-hidden bg-mist shadow-inner">
                    <Swiper
                      modules={[Navigation, Pagination, Autoplay]}
                      navigation
                      pagination={{ clickable: true, dynamicBullets: true }}
                      autoplay={{ delay: 4000, disableOnInteraction: false }}
                      loop={true}
                      className="w-full h-full"
                    >
                      {(listing.imgs || []).map((img: string, idx: number) => (
                        <SwiperSlide key={idx}>
                          <img 
                            src={resolveImageUrl(img)} 
                            alt={`${listing.name} ${idx}`} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </SwiperSlide>
                      ))}
                    </Swiper>
                  </div>
                  <div>
                    <p className="text-[0.62rem] tracking-widest uppercase text-clay mb-1 font-sans">{listing.neigh}</p>
                    <h2 className="font-serif text-3xl font-light mb-4">{listing.name}</h2>
                    <p className="text-sm text-muted leading-relaxed mb-6 font-light">{listing.desc}</p>
                    <div className="flex gap-2 flex-wrap">
                      {listing.tags?.map(t => (
                        <span key={t} className="text-[0.6rem] tracking-widest uppercase border border-mist text-muted p-1.5 px-3 font-sans">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Side: Calendar & Summary */}
                <div className="bg-cream/30 p-6 border border-mist">
                  <div className="mb-8">
                    <h3 className="font-serif text-xl font-light mb-4">Number of Guests</h3>
                    <div className="flex gap-2">
                      {[1, 2].map(num => (
                        <button
                          key={num}
                          onClick={() => setGuestCount(num)}
                          className={`flex-1 p-3 border font-sans text-[0.7rem] tracking-widest uppercase transition-all ${
                            guestCount === num 
                              ? "bg-charcoal text-white border-charcoal" 
                              : "bg-warm-white text-muted border-mist hover:border-clay"
                          }`}
                        >
                          {num} {num === 1 ? "Guest" : "Guests"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <h3 className="font-serif text-xl font-light mb-6">Select your dates</h3>
                  <Calendar 
                    listingId={String(listing.id)} 
                    onRangeChange={setRange} 
                    specialPrices={specialPrices}
                    basePrice={listing.price}
                    refreshTrigger={refreshTrigger}
                  />
                  
                  <div className="mt-8 pt-6 border-t border-mist">
                    {nights > 0 ? (
                      <div className="flex flex-col gap-3 mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[0.6rem] tracking-widest uppercase text-muted font-sans font-medium">Price Breakdown</span>
                          {priceLoading && <RefreshCw className="animate-spin text-clay" size={12} />}
                        </div>
                        <div className="max-h-[180px] overflow-y-auto pr-2 flex flex-col gap-2 bg-warm-white/40 p-3 border border-mist/30">
                          {breakdown.nights.map((n, i) => (
                            <div key={i} className="flex justify-between items-center text-xs pb-2 border-b border-mist/20 last:border-0">
                              <div className="flex flex-col">
                                <span className="text-charcoal font-medium">{n.date}</span>
                                <span className={`text-[0.6rem] uppercase tracking-wider ${n.type.includes('Event') ? 'text-clay font-semibold' : 'text-muted'}`}>{n.type}</span>
                              </div>
                              <span className="font-serif text-sm">€{n.price}</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-mist pt-4 mt-2">
                          <div className="flex justify-between items-baseline mb-1.5">
                            <span className="text-xs tracking-widest uppercase text-muted font-sans font-medium">Subtotal ({nights} nights)</span>
                            <span className="font-serif text-lg">€{breakdown.subtotal}</span>
                          </div>
                          {breakdown.cleaningFee > 0 && (
                            <div className="flex justify-between items-baseline mb-2 pb-2 border-b border-mist/40">
                              <span className="text-xs tracking-widest uppercase text-muted font-sans font-medium">Cleaning fee (one-time)</span>
                              <span className="font-serif text-lg text-clay">€{breakdown.cleaningFee}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-baseline mt-3">
                            <span className="text-sm font-bold tracking-widest uppercase text-charcoal font-sans">Total Amount</span>
                            <span className="font-serif text-3xl text-forest">€{total}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 mb-6">
                        <div className="flex justify-between items-baseline">
                          <div className="flex flex-col">
                            <span className="text-sm text-muted">Current price per night</span>
                            {getCurrentPrice().type !== 'Standard Rate' && (
                              <span className="text-[0.55rem] tracking-[0.1em] uppercase text-clay font-sans font-medium">
                                {getCurrentPrice().type}
                              </span>
                            )}
                          </div>
                          <span className="font-serif text-xl">€{getCurrentPrice().price}</span>
                        </div>
                        <p className="text-xs text-clay italic">Select a range to see total price and breakdown</p>
                      </div>
                    )}
                    
                    {nights > 0 && !isValidStay && (
                      <div className="mb-4 p-3 bg-clay/10 border border-clay/20 text-clay text-[0.7rem] tracking-wide uppercase font-medium flex items-center gap-2">
                        <Info size={14} />
                        Minimum stay for this home is {minStay} {minStay === 1 ? 'night' : 'nights'}. Please select more dates.
                      </div>
                    )}
                    
                    <button
                      disabled={(nights > 0 && !isValidStay) || guestCount === 0}
                      onClick={() => nights > 0 && isValidStay && guestCount > 0 && setStep(2)}
                      className={`w-full p-4 border-none font-sans text-xs tracking-widest uppercase transition-all ${nights > 0 && isValidStay && guestCount > 0 ? "cursor-pointer bg-forest text-white hover:bg-forest/90" : "cursor-default bg-mist text-muted opacity-60"}`}
                    >
                      {guestCount === 0 
                        ? "Select number of guests" 
                        : nights > 0 
                          ? (isValidStay ? "Continue to Extras" : `Min ${minStay} ${minStay === 1 ? 'night' : 'nights'} required`) 
                          : "Select dates to continue"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="max-w-[440px] mx-auto">
                <h2 className="font-serif text-2xl font-light mb-6 text-center">Enhance your stay</h2>
                {[{ key: "car", label: "Car Rental", sub: "Rental car ready on arrival.", tag: "€55/day", val: car, set: setCar }, { key: "tf", label: "Airport Transfer", sub: "Private transfer from Helsinki-Vantaa.", tag: "€35 flat", val: transfer, set: setTransfer }].map(x => (
                  <div key={x.key} onClick={() => x.set(v => !v)} className={`border p-5 mb-2.5 cursor-pointer ${x.val ? "border-clay bg-cream" : "border-mist bg-warmWhite"}`}>
                    <div className="flex justify-between mb-1">
                      <span className="font-serif text-lg font-light">{x.label}</span>
                      <span className={`text-[0.72rem] font-sans ${x.val ? "text-clay" : "text-muted"}`}>{x.val ? "✓ Added" : x.tag}</span>
                    </div>
                    <p className="text-[0.78rem] text-muted leading-relaxed font-light">{x.sub}</p>
                  </div>
                ))}
                <div className="p-4 px-5 bg-cream my-2 mb-5 text-[0.82rem] text-muted leading-loose">
                  <div className="flex justify-between"><span>Accommodation ({nights} nights)</span><span>€{breakdown.subtotal}</span></div>
                  {breakdown.cleaningFee > 0 && <div className="flex justify-between"><span>Cleaning fee</span><span>€{breakdown.cleaningFee}</span></div>}
                  {car && <div className="flex justify-between"><span>Car Rental</span><span>€{breakdown.carTotal}</span></div>}
                  {transfer && <div className="flex justify-between"><span>Airport Transfer</span><span>€35</span></div>}
                  <div className="flex justify-between border-t border-mist mt-2 pt-2 font-serif text-lg text-charcoal"><span>Total</span><span>€{total}</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="flex-1 p-3.5 bg-transparent border border-mist font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer text-muted">Back</button>
                  <button onClick={() => setStep(3)} className="flex-[2] p-3.5 bg-forest text-white border-none font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer">
                    {isInstantBook ? `Pay €${total} →` : "Continue"}
                  </button>
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                <div className="grid grid-cols-2 gap-2.5 mb-2.5">{fi("First name", "fn", "text", "Anna")}{fi("Last name", "ln", "text", "Smith")}</div>
                {fi("Email", "em", "email", "your@email.com")}
                
                {isInstantBook ? (
                  <>
                    <div className="my-3 p-2.5 px-3.5 bg-cream text-[0.75rem] text-muted flex gap-2 items-center">🔒 Secured with 256-bit SSL</div>
                    {fi("Card number", "card", "text", "4242 4242 4242 4242")}
                    <div className="grid grid-cols-2 gap-2.5 my-2.5 mb-5">{fi("Expiry", "exp", "text", "MM/YY")}{fi("CVV", "cvv", "text", "123")}</div>
                  </>
                ) : (
                  <div className="my-4">
                    <label className="block text-[0.65rem] uppercase tracking-widest text-muted font-sans font-bold mb-1.5">Message to Host</label>
                    <textarea
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Tell us a bit about your trip..."
                      className="w-full p-3.5 bg-warmWhite border border-mist font-sans text-sm focus:outline-none focus:border-clay min-h-[100px] resize-none"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} className="flex-1 p-3.5 bg-transparent border border-mist font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer text-muted">Back</button>
                  <button
                    onClick={handleReserve}
                    disabled={bookingLoading}
                    className="flex-[2] p-3.5 bg-forest text-white border-none font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer disabled:opacity-50"
                  >
                    {bookingLoading ? "Processing..." : (isInstantBook ? `Confirm · €${total}` : "Send Booking Request")}
                  </button>
                </div>
              </div>
            )}
            {step === 4 && (
              <div className="py-2">
                {showEmailTemplate ? (
                  <div className="fixed inset-0 z-[200] overflow-y-auto bg-warm-white">
                    <BookingEmailTemplate 
                      booking={{ id: bookingId, reference_number: bookingRef, check_in: range.start, check_out: range.end, total_price: total, guest_count: guestCount }}
                      listing={listing}
                      guest={{ first_name: form.fn }}
                      onClose={() => setShowEmailTemplate(false)}
                    />
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 bg-forest/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check className="text-forest" size={32} />
                      </div>
                      <h3 className="font-serif text-3xl font-light mb-2 text-charcoal">
                        {bookingStatus === 'confirmed' ? "Booking Confirmed!" : "Reservation Requested!"}
                      </h3>
                      <p className="text-muted text-[0.65rem] tracking-widest uppercase font-sans">
                        {bookingStatus === 'confirmed' 
                          ? <>Reference: <span className="text-charcoal font-bold">#{bookingRef || "----"}</span></>
                          : <>Request Reference: <span className="text-charcoal font-bold">#{bookingRef || "----"}</span></>
                        }
                      </p>
                      
                      {emailStatus.sent && (
                        <div className="mt-4 flex items-center justify-center gap-2 text-forest text-[0.65rem] tracking-widest uppercase font-sans font-bold bg-forest/5 py-2 px-4 rounded-full border border-forest/10">
                          <Send size={12} /> Confirmation email sent to {emailStatus.email}
                        </div>
                      )}
                      {emailStatus.error && (
                        <div className="mt-4 text-clay text-[0.65rem] tracking-widest uppercase font-sans font-bold">
                          Email delivery failed. Please save your itinerary below.
                        </div>
                      )}
                    </div>

                    {/* Personal Note Card */}
                    <div className="bg-[#FAF9F6] p-8 border border-mist/50 shadow-sm mb-8 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-clay/20" />
                      <p className="font-serif text-xl italic text-charcoal mb-6 leading-relaxed">
                        Dear {form.fn},
                      </p>
                      <p className="font-serif text-[1.05rem] text-muted leading-loose mb-8 italic">
                        {bookingStatus === 'pending' ? (
                          <>
                            Thank you for requesting to stay in our beautiful private unit, <span className="text-charcoal font-medium not-italic">{listing.name}</span>. 
                            This property requires host approval to ensure the best possible experience for our guests. 
                            We have received your request for <span className="text-charcoal font-medium not-italic">{range.start}</span> to <span className="text-charcoal font-medium not-italic">{range.end}</span> and are currently reviewing it. 
                            We appreciate your patience and will notify you as soon as the status is updated.
                          </>
                        ) : (
                          <>
                            {guestCount === 2 
                              ? "I'm so glad both of you chose my studio for your stay." 
                              : "I am so thrilled you'll be staying with us at "
                            }
                            <span className="text-charcoal font-medium not-italic">{listing.name}</span>. 
                            Helsinki is a magical city, and we've prepared everything to make your visit truly special. 
                            We'll send your personal entry codes 24 hours before you arrive.
                          </>
                        )}
                      </p>
                      <div className="mt-4">
                        <p className="font-cursive text-3xl text-clay mb-0.5">Anna Humalainen</p>
                        <p className="text-[0.6rem] tracking-[0.2em] uppercase text-muted font-sans">Host</p>
                      </div>
                    </div>

                    {/* Itinerary Details */}
                    <div className="bg-cream/50 p-6 border border-mist/30 mb-8">
                      <div className="flex justify-between mb-4 pb-3 border-b border-mist/30">
                        <span className="text-[0.65rem] uppercase tracking-widest text-muted font-sans">Accommodation</span>
                        <span className="text-charcoal font-serif text-sm">{listing.name}</span>
                      </div>
                      <div className="flex justify-between mb-3">
                        <span className="text-[0.65rem] uppercase tracking-widest text-muted font-sans">Dates</span>
                        <span className="text-charcoal font-serif text-sm">{range.start} — {range.end}</span>
                      </div>
                      <div className="flex justify-between mb-3">
                        <span className="text-[0.65rem] uppercase tracking-widest text-muted font-sans">Duration</span>
                        <span className="text-charcoal font-serif text-sm">{nights} Nights Stay</span>
                      </div>
                      <div className="flex justify-between mb-3">
                        <span className="text-[0.65rem] uppercase tracking-widest text-muted font-sans">Guests</span>
                        <span className="text-charcoal font-serif text-sm">{guestCount} {guestCount === 1 ? "Guest" : "Guests"}</span>
                      </div>
                      <div className="flex justify-between pt-4 mt-2 border-t border-mist/30">
                        <span className="text-[0.65rem] uppercase tracking-widest font-bold text-charcoal font-sans">Total Paid</span>
                        <span className="text-charcoal font-serif text-lg">€{total}</span>
                      </div>
                    </div>

                    {/* Host Contact Block */}
                    <div className="mb-8 p-5 border border-mist/20 rounded-sm bg-warm-white">
                      <p className="text-[0.6rem] tracking-[0.2em] uppercase text-muted font-sans mb-4 text-center">Host Contact</p>
                      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-10">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-cream flex items-center justify-center text-clay">
                            <Phone size={12} />
                          </div>
                          <span className="text-xs font-sans text-muted">+358 44 2400 228</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-cream flex items-center justify-center text-clay">
                            <Mail size={12} />
                          </div>
                          <span className="text-xs font-sans text-muted">anna.humalainen@gmail.com</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="p-4 bg-cream/50 border border-mist text-center">
                        <p className="text-[0.75rem] text-charcoal font-sans leading-relaxed">
                          To manage your booking, please visit the main page of <span className="font-medium text-clay">Anna's Stays</span> and click on the <span className="font-medium text-clay uppercase tracking-wider">Find My Booking</span> tab.
                        </p>
                      </div>
                      <button 
                        onClick={() => setShowEmailTemplate(true)}
                        className="w-full p-4 bg-white text-charcoal border border-mist font-sans text-[0.7rem] tracking-widest uppercase cursor-pointer hover:bg-mist transition-all flex items-center justify-center gap-2"
                      >
                        <FileText size={14} /> View Your Itinerary
                      </button>
                      <button 
                        onClick={onClose}
                        className="w-full p-4 bg-charcoal text-white border-none font-sans text-[0.7rem] tracking-widest uppercase cursor-pointer hover:bg-charcoal/90 transition-all shadow-md"
                      >
                        Close & Return Home
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
