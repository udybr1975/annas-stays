import { useState, useEffect } from "react";
import { C, LISTINGS } from "../constants";
import Calendar from "./Calendar";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import { supabase } from "../lib/supabase";
import { resolveImageUrl } from "../lib/imageUtils";
import { Info, RefreshCw, Check, Phone, Mail, FileText, Send } from "lucide-react";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/autoplay";

interface BookingModalProps {
  listing: any;
  onClose: () => void;
  initialStep?: number;
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
  const [isInstantBook, setIsInstantBook] = useState<boolean>(true);
  const [finalBookingData, setFinalBookingData] = useState<any>(null);
  const [isFetchingResult, setIsFetchingResult] = useState(false);

  useEffect(() => {
    fetchSpecialPrices();
    fetchBookedDates();
    fetchInstantBookStatus();

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (initialStep === 4 && sessionId) {
      pollForBooking(sessionId);
    }
  }, [listing.id, refreshTrigger]);

  const pollForBooking = async (sessionId: string) => {
    setIsFetchingResult(true);
    let attempts = 0;
    const maxAttempts = 15;

    const checkDB = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('*, guests(*)')
        .eq('stripe_session_id', sessionId)
        .single();

      if (data) {
        setFinalBookingData(data);
        setIsFetchingResult(false);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(checkDB, 2000);
      } else {
        setIsFetchingResult(false);
      }
    };
    checkDB();
  };

  const fetchInstantBookStatus = async () => {
    const { data } = await supabase.from('apartments').select('is_instant_book').eq('id', listing.id).single();
    if (data) setIsInstantBook(data.is_instant_book !== false);
  };

  const fetchBookedDates = async () => {
    const { data } = await supabase.from('bookings').select('check_in, check_out').eq('apartment_id', listing.id).not('status', 'in', '("cancelled","declined")');
    if (data) {
      const dates: string[] = [];
      data.forEach(b => {
        let curr = new Date(b.check_in);
        const last = new Date(b.check_out);
        while (curr < last) { dates.push(curr.toISOString().split('T')[0]); curr.setDate(curr.getDate() + 1); }
      });
      setBookedDates(dates);
    }
  };

  const fetchSpecialPrices = async () => {
    setPriceLoading(true);
    const { data } = await supabase.from("apartment_prices").select("*").eq("apartment_id", listing.id);
    if (data) setSpecialPrices(data);
    setPriceLoading(false);
  };

  const handleReserve = async () => {
    if (!form.fn || !form.em) { alert("Please fill in name and email."); return; }
    setBookingLoading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking: { nights, totalPrice: total, checkIn: range.start, checkOut: range.end, guestCount, car, transfer, message: form.message },
          listing,
          guest: { email: form.em.trim().toLowerCase(), firstName: form.fn.trim(), lastName: form.ln.trim() },
          isInstantBook
        }),
      });
      const session = await response.json();
      if (session.url) window.location.href = session.url;
    } catch (err) {
      console.error(err);
    } finally {
      setBookingLoading(false);
    }
  };

  const calculateBreakdown = () => {
    if (!range.start || !range.end) return { nights: [], subtotal: 0, total: 0 };
    const start = new Date(range.start);
    const end = new Date(range.end);
    const nightsList = [];
    let subtotal = 0;
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      const special = specialPrices.find(p => ds >= p.start_date && ds <= p.end_date);
      const price = special ? (special.price_override || special.price) : listing.price;
      nightsList.push({ date: ds, price });
      subtotal += price;
    }
    const cleaningFee = listing.cleaningFee || 0;
    const carTotal = car ? nightsList.length * 55 : 0;
    const transferTotal = transfer ? 35 : 0;
    return { nights: nightsList, subtotal, total: subtotal + cleaningFee + carTotal + transferTotal, cleaningFee, carTotal, transferTotal };
  };

  const breakdown = calculateBreakdown();
  const total = breakdown.total;
  const nights = breakdown.nights.length;
  const minStay = listing.minStay || 1;
  const isValidStay = nights >= minStay;

  const fi = (label: string, key: keyof typeof form, type?: string, ph?: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-[0.62rem] tracking-widest uppercase text-muted font-sans">{label}</label>
      <input type={type || "text"} placeholder={ph} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="bg-cream border border-mist p-3 font-sans text-sm text-charcoal outline-none w-full" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-[2000] flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-warm-white w-full ${step === 1 ? "max-w-[1000px]" : "max-w-[550px]"} my-auto p-6 md:p-10 relative font-sans transition-all duration-300`}>
        <button onClick={onClose} className="absolute top-4 right-5 text-xl text-muted z-10">✕</button>
        
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
              <div className="w-full h-[300px] md:h-[450px] overflow-hidden bg-mist">
                <Swiper modules={[Navigation, Pagination, Autoplay]} navigation pagination={{ clickable: true }} autoplay={{ delay: 4000 }} loop={true} className="w-full h-full">
                  {(listing.imgs || []).map((img: string, idx: number) => (
                    <SwiperSlide key={idx}><img src={resolveImageUrl(img)} className="w-full h-full object-cover" /></SwiperSlide>
                  ))}
                </Swiper>
              </div>
              <div>
                <p className="text-[0.62rem] tracking-widest uppercase text-clay mb-1">{listing.neigh}</p>
                <h2 className="font-serif text-3xl font-light mb-4">{listing.name}</h2>
                <p className="text-sm text-muted leading-relaxed mb-6 font-light">{listing.desc}</p>
              </div>
            </div>
            <div className="bg-cream/30 p-6 border border-mist">
              <h3 className="font-serif text-xl font-light mb-4">Guests & Dates</h3>
              <div className="flex gap-2 mb-6">
                {[1, 2].map(num => (
                  <button key={num} onClick={() => setGuestCount(num)} className={`flex-1 p-3 border text-[0.7rem] uppercase tracking-widest transition-all ${guestCount === num ? "bg-charcoal text-white border-charcoal" : "bg-warm-white text-muted border-mist"}`}>{num} Guest{num > 1 ? 's' : ''}</button>
                ))}
              </div>
              <Calendar listingId={String(listing.id)} onRangeChange={setRange} specialPrices={specialPrices} basePrice={listing.price} refreshTrigger={refreshTrigger} />
              <div className="mt-8 pt-6 border-t border-mist">
                <div className="flex justify-between items-baseline mb-6">
                  <span className="text-sm font-bold uppercase tracking-widest font-sans">Total</span>
                  <span className="font-serif text-3xl text-forest">€{total}</span>
                </div>
                <button disabled={!isValidStay || guestCount === 0} onClick={() => setStep(2)} className={`w-full p-4 text-xs tracking-widest uppercase transition-all ${isValidStay && guestCount > 0 ? "bg-forest text-white cursor-pointer" : "bg-mist text-muted cursor-default"}`}>Continue to Extras</button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-[440px] mx-auto">
            <h2 className="font-serif text-2xl font-light mb-6 text-center">Enhance your stay</h2>
            {[{ k: "car", l: "Car Rental", s: "Rental car ready on arrival.", p: "€55/day", v: car, f: setCar }, { k: "tf", l: "Airport Transfer", s: "Private transfer from Vantaa.", p: "€35 flat", v: transfer, f: setTransfer }].map(x => (
              <div key={x.k} onClick={() => x.f(!x.v)} className={`border p-5 mb-2.5 cursor-pointer transition-colors ${x.v ? "border-clay bg-cream" : "border-mist"}`}>
                <div className="flex justify-between mb-1"><span className="font-serif text-lg">{x.l}</span><span className="text-[0.72rem] text-clay">{x.v ? "✓ Added" : x.p}</span></div>
                <p className="text-[0.78rem] text-muted font-light">{x.s}</p>
              </div>
            ))}
            <div className="flex gap-2 mt-8">
              <button onClick={() => setStep(1)} className="flex-1 p-3.5 border border-mist uppercase text-[0.72rem] tracking-widest">Back</button>
              <button onClick={() => setStep(3)} className="flex-[2] p-3.5 bg-forest text-white uppercase text-[0.72rem] tracking-widest">Continue</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-[440px] mx-auto">
            <h2 className="font-serif text-2xl font-light mb-6 text-center">Guest Information</h2>
            <div className="grid grid-cols-2 gap-2.5 mb-2.5">{fi("First name", "fn")}{fi("Last name", "ln")}</div>
            {fi("Email", "em", "email")}
            <div className="mt-8 flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 p-3.5 border border-mist uppercase text-[0.72rem] tracking-widest">Back</button>
              <button onClick={handleReserve} disabled={bookingLoading} className="flex-[2] p-3.5 bg-forest text-white uppercase text-[0.72rem] tracking-widest">
                {bookingLoading ? "Connecting..." : "Pay & Confirm"}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="py-2 text-center">
            {isFetchingResult ? (
              <div className="flex flex-col items-center py-20">
                <div className="w-12 h-12 border-4 border-clay border-t-transparent rounded-full animate-spin mb-4" />
                <p className="font-serif text-xl">Finalizing your booking...</p>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 bg-forest/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Check className="text-forest" size={24} />
                </div>
                <h3 className="font-serif text-3xl font-light mb-6 text-charcoal">
                  {isInstantBook ? "Booking Confirmed!" : "Request Received!"}
                </h3>

                <div className="w-full h-48 mb-6 overflow-hidden bg-mist">
                  <img src={resolveImageUrl(listing.imgs[0])} className="w-full h-full object-cover" alt={listing.name} />
                </div>

                <div className="bg-[#FAF9F6] p-8 border border-mist/50 mb-8 relative text-left">
                  <p className="font-serif text-xl italic text-charcoal mb-4">Dear {finalBookingData?.guests?.first_name || 'Guest'},</p>
                  <p className="font-serif text-[1.05rem] text-muted leading-loose italic mb-8">
                    I'm so glad you chose my {listing.name} for your stay. Helsinki is a magical city, and we've prepared everything to make your visit truly special. We'll send your personal entry codes 24 hours before you arrive.
                  </p>
                  <p className="font-cursive text-3xl text-clay mb-0">Anna Humalainen</p>
                  <p className="text-[0.6rem] tracking-[0.2em] uppercase text-muted font-sans">Host</p>
                </div>

                <div className="border-t border-b border-mist py-6 mb-8 grid grid-cols-2 gap-y-6 text-left">
                  <div>
                    <p className="text-[0.6rem] uppercase tracking-widest text-muted mb-1">Dates</p>
                    <p className="text-sm font-sans">{finalBookingData?.check_in || '...'} — {finalBookingData?.check_out || '...'}</p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] uppercase tracking-widest text-muted mb-1">Guests</p>
                    <p className="text-sm font-sans">{finalBookingData?.guest_count || '2'} Guests</p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] uppercase tracking-widest text-muted mb-1">Reference</p>
                    <p className="text-sm font-sans font-medium text-clay">{finalBookingData?.booking_reference || 'RES-PENDING'}</p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] uppercase tracking-widest text-muted mb-1">Total Paid</p>
                    <p className="text-sm font-sans font-medium">€{finalBookingData?.total_price || total}</p>
                  </div>
                </div>

                <button onClick={onClose} className="w-full p-4 bg-charcoal text-white font-sans text-[0.7rem] tracking-widest uppercase hover:bg-charcoal/90 transition-all">
                  Return Home
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
