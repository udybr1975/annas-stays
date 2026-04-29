import { useState, useEffect } from "react";
import Calendar from "./Calendar";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import { supabase } from "../lib/supabase";
import { resolveImageUrl } from "../lib/imageUtils";
import { Info, RefreshCw } from "lucide-react";

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
  const [form, setForm] = useState({ fn: "", ln: "", em: "", message: "" });
  const [specialPrices, setSpecialPrices] = useState<any[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [guestCount, setGuestCount] = useState<number>(0);
  const [isInstantBook, setIsInstantBook] = useState<boolean>(true);

  useEffect(() => {
    fetchSpecialPrices();
    fetchBookedDates();
    fetchInstantBookStatus();
  }, [listing.id, refreshTrigger]);

  const fetchInstantBookStatus = async () => {
    const { data, error } = await supabase
      .from("apartments")
      .select("is_instant_book")
      .eq("id", listing.id)
      .single();
    if (!error && data) {
      setIsInstantBook(data.is_instant_book !== false);
    }
  };

  const fetchBookedDates = async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("check_in, check_out, status, payment_link_expires_at")
      .eq("apartment_id", listing.id)
      .in("status", ["confirmed", "awaiting_payment"]);

    if (error) {
      console.error("Error fetching booked dates:", error);
      return;
    }

    const now = new Date();
    const dates: string[] = [];
    (data || []).forEach((booking) => {
      if (booking.status === "awaiting_payment" && booking.payment_link_expires_at) {
        const expires = new Date(booking.payment_link_expires_at);
        if (expires <= now) return;
      }
      let curr = new Date(booking.check_in);
      const last = new Date(booking.check_out);
      while (curr < last) {
        dates.push(curr.toISOString().split("T")[0]);
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

  const getPriceForDate = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);

    const special = specialPrices.find((p) => {
      if (p.pricing_type === "season") return false;
      const start = new Date(p.start_date || p.date); start.setHours(0, 0, 0, 0);
      const end = new Date(p.end_date || p.date); end.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    });
    if (special) return { price: special.price_override || special.price, type: "Event: " + (special.event_name || "Special Pricing") };

    const season = specialPrices.find((p) => {
      if (p.pricing_type !== "season") return false;
      const start = new Date(p.start_date); start.setHours(0, 0, 0, 0);
      const end = new Date(p.end_date); end.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    });
    if (season) {
      const day = date.getDay();
      const isWeekend = day === 5 || day === 6;
      return {
        price: isWeekend ? season.weekend_price_override || season.price_override : season.price_override,
        type: season.event_name + (isWeekend ? " (Weekend)" : " (Weekday)"),
      };
    }

    const day = date.getDay();
    const isWeekend = day === 5 || day === 6;
    if (isWeekend && listing.weekend_pricing_enabled) {
      const base = listing.price;
      const val = listing.weekend_pricing_value || 0;
      const price = listing.weekend_pricing_type === "percentage" ? base * (1 + val / 100) : base + val;
      return { price: Math.round(price), type: "Weekend Rate" };
    }

    return { price: listing.price, type: "Base Rate" };
  };

  const calculateBreakdown = () => {
    if (!range.start || !range.end) return { nights: [], subtotal: 0, total: 0, cleaningFee: 0, carTotal: 0, transferTotal: 0 };
    const start = new Date(range.start);
    const end = new Date(range.end);
    const nightsList = [];
    let subtotal = 0;
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const { price, type } = getPriceForDate(dateStr);
      nightsList.push({ date: dateStr, price, type });
      subtotal += price;
    }
    const cleaningFee = listing.cleaningFee || listing.cleaning_fee || 0;
    const carTotal = car ? nightsList.length * 55 : 0;
    const transferTotal = transfer ? 35 : 0;
    const total = subtotal + cleaningFee + carTotal + transferTotal;
    return { nights: nightsList, subtotal, total, cleaningFee, carTotal, transferTotal };
  };

  const breakdown = calculateBreakdown();
  const nights = breakdown.nights.length;
  const total = breakdown.total;
  const minStay = listing.minStay || listing.min || 1;
  const isValidStay = nights >= minStay;

  const checkDateOverlap = (): boolean => {
    if (!range.start || !range.end) return false;
    let curr = new Date(range.start);
    const last = new Date(range.end);
    while (curr < last) {
      if (bookedDates.includes(curr.toISOString().split("T")[0])) return true;
      curr.setDate(curr.getDate() + 1);
    }
    return false;
  };

  const generateRef = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let r = "";
    for (let i = 0; i < 8; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return `RES-${r}`;
  };

  // ── INSTANT BOOK: redirect to Stripe ──────────────────────────────────────
  const handleInstantBook = async () => {
    if (!form.fn.trim() || !form.em.trim()) {
      alert("Please fill in your first name and email address.");
      return;
    }
    if (checkDateOverlap()) {
      alert("Your selected dates include dates that are already booked. Please choose a different range.");
      setRange({ start: null, end: null });
      setStep(1);
      return;
    }

    setSubmitting(true);
    try {
      const finalRef = generateRef();

      const stripeResponse = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking: {
            referenceNumber: finalRef,
            checkIn: range.start,
            checkOut: range.end,
            nights: breakdown.nights.length,
            totalPrice: total,
            guestCount: guestCount,
            car: car,
            transfer: transfer,
            message: form.message.trim(),
          },
          listing: { id: listing.id, name: listing.name },
          guest: {
            email: form.em.trim().toLowerCase(),
            firstName: form.fn.trim(),
            lastName: form.ln.trim(),
          },
          isInstantBook: true,
        }),
      });

      if (!stripeResponse.ok) {
        const errData = await stripeResponse.json().catch(() => ({}));
        alert("Payment setup failed: " + (errData.error || "Please try again."));
        setSubmitting(false);
        return;
      }

      const { url } = await stripeResponse.json();
      if (url) {
        window.location.href = url;
      } else {
        alert("Could not get payment URL. Please try again.");
        setSubmitting(false);
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      alert("An unexpected error occurred: " + (err.message || "Unknown error"));
      setSubmitting(false);
    }
  };

  // ── PENDING REQUEST: save to Supabase, no Stripe ───────────────────────────
  const handlePendingRequest = async () => {
    if (!form.fn.trim() || !form.em.trim()) {
      alert("Please fill in your first name and email address.");
      return;
    }
    if (checkDateOverlap()) {
      alert("Your selected dates include dates that are already booked. Please choose a different range.");
      setRange({ start: null, end: null });
      setStep(1);
      return;
    }

    setSubmitting(true);
    try {
      const finalRef = generateRef();

      // 1. Upsert guest
      const { data: guestData, error: guestError } = await supabase
        .from("guests")
        .upsert(
          {
            email: form.em.trim().toLowerCase(),
            first_name: form.fn.trim(),
            last_name: form.ln.trim(),
          },
          { onConflict: "email", ignoreDuplicates: false }
        )
        .select("id")
        .single();

      if (guestError || !guestData?.id) {
        alert("Could not save your details. Please try again.");
        setSubmitting(false);
        return;
      }

      // 2. Insert booking as pending
      const { error: bookingError } = await supabase.from("bookings").insert({
        apartment_id: listing.id,
        guest_id: guestData.id,
        check_in: range.start,
        check_out: range.end,
        total_price: total,
        guest_count: guestCount,
        status: "pending",
        reference_number: finalRef,
        admin_needs_attention: true,
        notes: form.message.trim() || null,
      });

      if (bookingError) {
        alert("Could not submit your request. Please try again.");
        setSubmitting(false);
        return;
      }

// 3. ntfy to Anna — via server to avoid browser CORS restrictions
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New Booking Request",
          priority: "high",
          body:
            "New request: " +
            form.fn.trim() +
            " " +
            form.ln.trim() +
            " wants " +
            listing.name +
            " | " +
            range.start +
            " to " +
            range.end +
            " | EUR " +
            total,
        }),
      }).catch(() => {});

      // 4. Acknowledgement email to guest
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: form.em.trim().toLowerCase(),
          subject: "Reservation Request Received — #" + finalRef + " | Anna's Stays",
          html:
            '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;">' +
            '<h2 style="font-weight:normal;">Request Received</h2>' +
            "<p>Dear " + form.fn.trim() + ",</p>" +
            "<p>Thank you for your request for <strong>" + listing.name + "</strong>. We will review it and get back to you shortly. If approved, you will receive a secure payment link by email.</p>" +
            "<p><strong>Reference:</strong> #" + finalRef + "</p>" +
            "<p><strong>Check-in:</strong> " + range.start + "</p>" +
            "<p><strong>Check-out:</strong> " + range.end + "</p>" +
            "<p><strong>Total if approved:</strong> EUR " + total + "</p>" +
            '<p style="font-style:italic;color:#5C7A5C;">- Anna Humalainen, Host</p>' +
            "</div>",
        }),
      }).catch(() => {});

      // 5. Notification email to Anna
      fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "info@anna-stays.fi",
          subject: "New Booking Request — #" + finalRef + " | Anna's Stays",
          html:
            '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;">' +
            '<h2 style="font-weight:normal;">New Booking Request</h2>' +
            "<p><strong>Guest:</strong> " + form.fn.trim() + " " + form.ln.trim() + "</p>" +
            '<p><strong>Email:</strong> <a href="mailto:' + form.em.trim() + '">' + form.em.trim() + "</a></p>" +
            "<p><strong>Apartment:</strong> " + listing.name + "</p>" +
            "<p><strong>Reference:</strong> #" + finalRef + "</p>" +
            "<p><strong>Check-in:</strong> " + range.start + "</p>" +
            "<p><strong>Check-out:</strong> " + range.end + "</p>" +
            "<p><strong>Guests:</strong> " + guestCount + "</p>" +
            "<p><strong>Total if approved:</strong> EUR " + total + "</p>" +
            (form.message.trim() ? "<p><strong>Message:</strong> " + form.message.trim() + "</p>" : "") +
            "</div>",
        }),
      }).catch(() => {});

      // 6. Redirect to success page
      window.location.href = `/booking-success?ref=${finalRef}&pending=true`;

    } catch (err: any) {
      alert("An unexpected error occurred: " + (err.message || "Unknown error"));
      setSubmitting(false);
    }
  };

  const fi = (label: string, key: keyof typeof form, type?: string, ph?: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-[0.62rem] tracking-widest uppercase text-muted font-sans">{label}</label>
      <input
        type={type || "text"}
        placeholder={ph || ""}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="bg-cream border border-mist p-3 font-sans text-sm text-charcoal font-light outline-none w-full focus:border-clay transition-colors"
      />
    </div>
  );

  const STEPS = ["Details", "Extras", "Your Info"];

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-[2000] flex items-center justify-center p-4">
      <div
        className={`bg-warm-white w-full ${
          step === 1 ? "max-w-[1000px]" : "max-w-[520px]"
        } max-h-[92vh] overflow-y-auto p-6 md:p-10 relative font-sans transition-all duration-300`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-5 bg-none border-none text-xl cursor-pointer text-muted z-10 hover:text-charcoal transition-colors"
        >
          ✕
        </button>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-7 max-w-[440px] mx-auto">
          {STEPS.map((l, i) => (
            <div key={l} className="flex-1">
              <div className={`h-0.5 mb-1 ${step > i + 1 ? "bg-clay" : step === i + 1 ? "bg-forest" : "bg-mist"}`} />
              <span className={`text-[0.6rem] tracking-widest uppercase font-sans ${step === i + 1 ? "text-forest" : "text-muted"}`}>{l}</span>
            </div>
          ))}
        </div>

        {/* ─── STEP 1 ───────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
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
                  {listing.tags?.map((t: string) => (
                    <span key={t} className="text-[0.6rem] tracking-widest uppercase border border-mist text-muted p-1.5 px-3 font-sans">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-cream/30 p-6 border border-mist">
              <div className="mb-8">
                <h3 className="font-serif text-xl font-light mb-4">Number of Guests</h3>
                <div className="flex gap-2">
                  {[1, 2].map((num) => (
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
                            <span className={`text-[0.6rem] uppercase tracking-wider ${n.type.includes("Event") ? "text-clay font-semibold" : "text-muted"}`}>
                              {n.type}
                            </span>
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
                        <span className="text-sm font-bold tracking-widest uppercase text-charcoal font-sans">Total</span>
                        <span className="font-serif text-3xl text-forest">€{total}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-muted">From</span>
                      <span className="font-serif text-xl">€{listing.price} / night</span>
                    </div>
                    <p className="text-xs text-clay italic mt-2">Select dates to see full price breakdown</p>
                  </div>
                )}

                {nights > 0 && !isValidStay && (
                  <div className="mb-4 p-3 bg-clay/10 border border-clay/20 text-clay text-[0.7rem] tracking-wide uppercase font-medium flex items-center gap-2">
                    <Info size={14} />
                    Minimum stay is {minStay} {minStay === 1 ? "night" : "nights"} — please select more dates.
                  </div>
                )}

                <button
                  disabled={(nights > 0 && !isValidStay) || guestCount === 0}
                  onClick={() => nights > 0 && isValidStay && guestCount > 0 && setStep(2)}
                  className={`w-full p-4 border-none font-sans text-xs tracking-widest uppercase transition-all ${
                    nights > 0 && isValidStay && guestCount > 0
                      ? "cursor-pointer bg-forest text-white hover:bg-forest/90"
                      : "cursor-default bg-mist text-muted opacity-60"
                  }`}
                >
                  {guestCount === 0
                    ? "Select number of guests"
                    : nights > 0
                    ? isValidStay
                      ? "Continue to Extras →"
                      : `Min ${minStay} ${minStay === 1 ? "night" : "nights"} required`
                    : "Select dates to continue"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2 ───────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="max-w-[440px] mx-auto">
            <h2 className="font-serif text-2xl font-light mb-6 text-center">Enhance your stay</h2>
            {[
              { key: "car", label: "Car Rental", sub: "Rental car ready on arrival — ideal for day trips.", tag: "€55/day", val: car, set: setCar },
              { key: "tf", label: "Airport Transfer", sub: "Private transfer from Helsinki-Vantaa airport.", tag: "€35 flat", val: transfer, set: setTransfer },
            ].map((x) => (
              <div
                key={x.key}
                onClick={() => x.set((v: boolean) => !v)}
                className={`border p-5 mb-2.5 cursor-pointer transition-colors ${
                  x.val ? "border-clay bg-cream" : "border-mist bg-warm-white hover:bg-cream/40"
                }`}
              >
                <div className="flex justify-between mb-1">
                  <span className="font-serif text-lg font-light">{x.label}</span>
                  <span className={`text-[0.72rem] font-sans ${x.val ? "text-clay" : "text-muted"}`}>
                    {x.val ? "✓ Added" : x.tag}
                  </span>
                </div>
                <p className="text-[0.78rem] text-muted leading-relaxed font-light">{x.sub}</p>
              </div>
            ))}

            <div className="p-4 px-5 bg-cream my-2 mb-5 text-[0.82rem] text-muted leading-loose">
              <div className="flex justify-between"><span>Accommodation ({nights} nights)</span><span>€{breakdown.subtotal}</span></div>
              {breakdown.cleaningFee > 0 && <div className="flex justify-between"><span>Cleaning fee</span><span>€{breakdown.cleaningFee}</span></div>}
              {car && <div className="flex justify-between"><span>Car Rental ({nights} days)</span><span>€{breakdown.carTotal}</span></div>}
              {transfer && <div className="flex justify-between"><span>Airport Transfer</span><span>€35</span></div>}
              <div className="flex justify-between border-t border-mist mt-2 pt-2 font-serif text-lg text-charcoal">
                <span>Total</span><span>€{total}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 p-3.5 bg-transparent border border-mist font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer text-muted hover:bg-cream transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-[2] p-3.5 bg-forest text-white border-none font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer hover:bg-forest/90 transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3 ───────────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="max-w-[440px] mx-auto">
            <h2 className="font-serif text-2xl font-light mb-6 text-center">Your details</h2>

            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              {fi("First name", "fn", "text", "Anna")}
              {fi("Last name", "ln", "text", "Smith")}
            </div>
            {fi("Email address", "em", "email", "your@email.com")}

            <div className="mt-3 flex flex-col gap-1">
              <label className="text-[0.62rem] tracking-widest uppercase text-muted font-sans">
                {isInstantBook ? "Special requests" : "Message to Host"}
                <span className="normal-case text-muted/70 ml-1">(optional)</span>
              </label>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder={isInstantBook ? "Any special requests or questions..." : "Tell us a bit about your trip..."}
                className="w-full p-3.5 bg-cream border border-mist font-sans text-sm focus:outline-none focus:border-clay min-h-[90px] resize-none"
              />
            </div>

            <div className="mt-4 mb-5 p-3.5 bg-cream border border-mist text-[0.75rem] text-muted leading-relaxed">
              {isInstantBook
                ? "You will be redirected to Stripe to complete your payment securely. Your stay is confirmed once payment is received."
                : "Your request will be sent to Anna for review. No payment is required now. If approved, you will receive a secure payment link by email within a few hours."}
            </div>

            <div className="p-4 bg-cream/60 border border-mist mb-5 text-[0.82rem] text-muted leading-loose">
              <div className="flex justify-between font-medium text-charcoal mb-1"><span>{listing.name}</span></div>
              <div className="flex justify-between"><span>{range.start} → {range.end}</span><span>{nights} nights</span></div>
              <div className="flex justify-between"><span>Guests</span><span>{guestCount}</span></div>
              {breakdown.cleaningFee > 0 && <div className="flex justify-between"><span>Cleaning fee</span><span>€{breakdown.cleaningFee}</span></div>}
              {car && <div className="flex justify-between"><span>Car Rental</span><span>€{breakdown.carTotal}</span></div>}
              {transfer && <div className="flex justify-between"><span>Airport Transfer</span><span>€35</span></div>}
              <div className="flex justify-between border-t border-mist mt-2 pt-2 font-serif text-lg text-charcoal">
                <span>{isInstantBook ? "Total to pay" : "Total if approved"}</span>
                <span>€{total}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex-1 p-3.5 bg-transparent border border-mist font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer text-muted hover:bg-cream transition-colors"
              >
                Back
              </button>
              <button
                onClick={isInstantBook ? handleInstantBook : handlePendingRequest}
                disabled={submitting}
                className="flex-[2] p-3.5 bg-forest text-white border-none font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer disabled:opacity-60 hover:bg-forest/90 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><RefreshCw size={14} className="animate-spin" /> Submitting...</>
                ) : isInstantBook ? (
                  `Pay €${total} via Stripe →`
                ) : (
                  "Send Request →"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
