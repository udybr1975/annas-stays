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
  initialStep?: number; // Added to support direct access to success state
}

export default function BookingModal({ listing, onClose, initialStep = 1 }: BookingModalProps) {
  const [step, setStep] = useState(initialStep);
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [car, setCar] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [form, setForm] = useState({ fn: "", ln: "", em: "", message: "" });
  const [specialPrices, setSpecialPrices] = useState<any[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
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
    if (!form.fn || !form.em) {
      alert("Please fill in name and email.");
      return;
    }

    setBookingLoading(true);

    try {
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
          alert("Selected dates are no longer available.");
          setStep(1);
          setBookingLoading(false);
          return;
        }
      }

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking: {
            nights: nights,
            totalPrice: total,
            checkIn: range.start,
            checkOut: range.end,
            guestCount: guestCount,
            car: car,
            transfer: transfer,
            message: form.message
          },
          listing: listing,
          guest: {
            email: form.em.trim().toLowerCase(),
            firstName: form.fn.trim(),
            lastName: form.ln.trim()
          },
          isInstantBook: isInstantBook
        }),
      });

      const session = await response.json();

      if (session.url) {
        window.location.href = session.url;
      } else {
        throw new Error(session.error || 'Failed to initialize payment.');
      }

    } catch (err: any) {
      console.error("Stripe Redirect Error:", err);
      alert(`Error: ${err.message || "Unknown error"}`);
    } finally {
      setBookingLoading(false);
    }
  };

  const getPriceForDate = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    
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

    const season = specialPrices.find(p => {
      if (p.pricing_type !== 'season') return false;
      const start = new Date(p.start_date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(p.end_date);
      end.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    });

    if (season) {
      const day = date.getDay();
      const isWeekend = day === 5 || day === 6;
      return {
        price: isWeekend ? (season.weekend_price_override || season.price_override) : season.price_override,
        type: season.event_name + (isWeekend ? " (Weekend)" : " (Weekday)")
      };
    }

    return { price: listing.price, type: "Base Rate" };
  };

  const getCurrentPrice = () => {
    const today = new Date().toISOString().split('T')[0];
    return getPriceForDate(today);
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
        value={form[key as keyof typeof form]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="bg-cream border border-mist p-3 font-sans text-sm text-charcoal font-light outline-none w-full"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-[2000] flex items-center justify-center p-4">
      <div className={`bg-warm-white w-full ${step === 1 ? "max-w-[1000px]" : "max-w-[520px]"} max-h-[92vh] overflow-y-auto p-6 md:p-10 relative font-sans transition-all duration-300`}>
        <button onClick={onClose} className="absolute top-4 right-5 bg-none border-none text-xl cursor-pointer text-muted z-10">✕</button>
        
        {step < 4 && (
          <div className="flex gap-1.5 mb-7 max-w-[440px] mx-auto">
            {["Details", "Extras", "Review"].map((l, i) => (
              <div key={l} className="flex-1">
                <div className={`h-0.5 mb-1 ${step > i + 1 ? "bg-clay" : step === i + 1 ? "bg-forest" : "bg-mist"}`} />
                <span className={`text-[0.6rem] tracking-widest uppercase font-sans ${step === i + 1 ? "text-forest" : "text-muted"}`}>{l}</span>
              </div>
            ))}
          </div>
        )}

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
                    <span key={t} className="text-[0.6rem] tracking-widest uppercase border border-mist text-muted p-1.5 px-3 font-sans">{t}</span>
                  ))}
                </div>
              </div>
            </div>

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
                        {getCurrentPrice().type !== 'Base Rate' && (
                          <span className="text-[0.55rem] tracking-[0.1em] uppercase text-clay font-sans font-medium">
                            {getCurrentPrice().type}
                          </span>
                        )}
                      </div>
                      <span className="font-serif text-xl">€{getCurrentPrice().price}</span>
                    </div>
                  </div>
                )}
                <button
                  disabled={(nights > 0 && !isValidStay) || guestCount === 0}
                  onClick={() => nights > 0 && isValidStay && guestCount > 0 && setStep(2)}
                  className={`w-full p-4 border-none font-sans text-xs tracking-widest uppercase transition-all ${nights > 0 && isValidStay && guestCount > 0 ? "cursor-pointer bg-forest text-white hover:bg-forest/90" : "cursor-default bg-mist text-muted opacity-60"}`}
                >
                  {guestCount === 0 ? "Select number of guests" : nights > 0 ? (isValidStay ? "Continue to Extras" : `Min ${minStay} nights required`) : "Select dates to continue"}
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
              {car && <div className="flex justify-between"><span>Car Rental</span><span>€{breakdown.carTotal}</span></div>}
              {transfer && <div className="flex justify-between"><span>Airport Transfer</span><span>€35</span></div>}
              <div className="flex justify-between border-t border-mist mt-2 pt-2 font-serif text-lg text-charcoal"><span>Total</span><span>€{total}</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 p-3.5 bg-transparent border border-mist font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer text-muted">Back</button>
              <button onClick={() => setStep(3)} className="flex-[2] p-3.5 bg-forest text-white border-none font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer">Continue</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-[440px] mx-auto">
            <h2 className="font-serif text-2xl font-light mb-6 text-center">Guest Information</h2>
            <div className="grid grid-cols-2 gap-2.5 mb-2.5">{fi("First name", "fn", "text", "Anna")}{fi("Last name", "ln", "text", "Smith")}</div>
            {fi("Email", "em", "email", "your@email.com")}
            {!isInstantBook && (
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
            <div className="mt-6 flex flex-col gap-3">
              <div className="p-3.5 bg-cream text-[0.72rem] text-muted leading-relaxed border-l-2 border-clay">
                {isInstantBook 
                  ? "You will be redirected to Stripe to securely complete your payment." 
                  : "Your card will be authorized now, but you will only be charged after host approval."}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="flex-1 p-3.5 bg-transparent border border-mist font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer text-muted">Back</button>
                <button
                  onClick={handleReserve}
                  disabled={bookingLoading}
                  className="flex-[2] p-3.5 bg-forest text-white border-none font-sans text-[0.72rem] tracking-widest uppercase cursor-pointer disabled:opacity-50"
                >
                  {bookingLoading ? "Processing..." : (isInstantBook ? "Pay & Confirm" : "Request Booking")}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="py-2 text-center">
            <div className="w-16 h-16 bg-forest/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="text-forest" size={32} />
            </div>
            <h3 className="font-serif text-3xl font-light mb-6 text-charcoal">
              {isInstantBook ? "Booking Confirmed!" : "Request Received!"}
            </h3>

            <div className="bg-[#FAF9F6] p-8 border border-mist/50 shadow-sm mb-8 relative text-left">
              <div className="absolute top-0 left-0 w-1 h-full bg-clay/20" />
              <p className="font-serif text-xl italic text-charcoal mb-4">Dear Guest,</p>
              <p className="font-serif text-[1.05rem] text-muted leading-loose italic mb-8">
                {isInstantBook ? (
                  <>Thank you for choosing <span className="text-charcoal not-italic font-medium">{listing.name}</span>. Helsinki is magical, and we have prepared everything to make your stay special. We'll send your entry codes 24 hours before arrival.</>
                ) : (
                  <>We've received your request for <span className="text-charcoal not-italic font-medium">{listing.name}</span>. We are currently reviewing it and will notify you as soon as the status is updated.</>
                )}
              </p>
              <p className="font-cursive text-3xl text-clay mb-0">Anna Humalainen</p>
              <p className="text-[0.6rem] tracking-[0.2em] uppercase text-muted font-sans">Host</p>
            </div>

            <button 
              onClick={onClose}
              className="w-full p-4 bg-charcoal text-white font-sans text-[0.7rem] tracking-widest uppercase hover:bg-charcoal/90 transition-all"
            >
              Return Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
