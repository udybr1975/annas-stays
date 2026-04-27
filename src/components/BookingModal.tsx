import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { resolveImageUrl } from "../lib/imageUtils";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import { Check, RefreshCw } from "lucide-react";
import Calendar from "./Calendar";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

interface BookingModalProps {
  listing: any;
  onClose: () => void;
  initialStep?: number;
}

export default function BookingModal({ listing, onClose, initialStep = 1 }: BookingModalProps) {
  const [step, setStep] = useState(initialStep);
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [guestCount, setGuestCount] = useState<number>(0);
  const [car, setCar] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [form, setForm] = useState({ fn: "", ln: "", em: "", message: "" });
  const [specialPrices, setSpecialPrices] = useState<any[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [isInstantBook, setIsInstantBook] = useState<boolean>(true);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data: p } = await supabase.from("apartment_prices").select("*").eq("apartment_id", listing.id);
      if (p) setSpecialPrices(p);
      const { data: a } = await supabase.from('apartments').select('is_instant_book').eq('id', listing.id).single();
      if (a) setIsInstantBook(a.is_instant_book !== false);
    };
    fetchSettings();
  }, [listing.id]);

  const calculateTotal = () => {
    if (!range.start || !range.end) return 0;
    const start = new Date(range.start);
    const end = new Date(range.end);
    let subtotal = 0;
    let nightsCount = 0;
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      const special = specialPrices.find(p => ds >= p.start_date && ds <= p.end_date);
      subtotal += special ? (special.price_override || special.price) : listing.price;
      nightsCount++;
    }
    return subtotal + (listing.cleaningFee || 0) + (car ? nightsCount * 55 : 0) + (transfer ? 35 : 0);
  };

  const total = calculateTotal();
  const nights = range.start && range.end ? Math.ceil((new Date(range.end).getTime() - new Date(range.start).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  const handleReserve = async () => {
    setBookingLoading(true);
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking: { nights, totalPrice: total, checkIn: range.start, checkOut: range.end, guestCount },
        listing,
        guest: { email: form.em, firstName: form.fn, lastName: form.ln },
        isInstantBook
      }),
    });
    const session = await res.json();
    if (session.url) window.location.href = session.url;
    setBookingLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-[2000] flex items-center justify-center p-4 overflow-y-auto">
      <div className={`bg-warm-white w-full ${step === 1 ? "max-w-[1000px]" : "max-w-[550px]"} p-6 md:p-10 relative font-sans`}>
        <button onClick={onClose} className="absolute top-4 right-5 text-xl">✕</button>

        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div>
              <div className="w-full h-80 overflow-hidden mb-6">
                <Swiper modules={[Navigation, Pagination, Autoplay]} navigation pagination={{ clickable: true }} autoplay={{ delay: 4000 }} loop className="h-full">
                  {listing.imgs.map((img: string, i: number) => (
                    <SwiperSlide key={i}><img src={resolveImageUrl(img)} className="w-full h-full object-cover" /></SwiperSlide>
                  ))}
                </Swiper>
              </div>
              <h2 className="font-serif text-3xl mb-2">{listing.name}</h2>
              <p className="text-sm text-muted">{listing.desc}</p>
            </div>
            <div className="bg-cream/30 p-6 border border-mist">
              <h3 className="font-serif text-xl mb-4">Guests & Dates</h3>
              <div className="flex gap-2 mb-6">
                {[1, 2].map(n => (
                  <button key={n} onClick={() => setGuestCount(n)} className={`flex-1 p-3 border text-[0.7rem] uppercase tracking-widest ${guestCount === n ? "bg-charcoal text-white" : "bg-white text-muted"}`}>{n} Guest{n > 1 ? 's' : ''}</button>
                ))}
              </div>
              <Calendar listingId={String(listing.id)} onRangeChange={setRange} specialPrices={specialPrices} basePrice={listing.price} />
              <div className="mt-8 pt-6 border-t border-mist flex justify-between items-center">
                <span className="font-serif text-3xl text-forest">€{total}</span>
                <button disabled={nights === 0 || guestCount === 0} onClick={() => setStep(2)} className="p-4 bg-forest text-white uppercase text-xs tracking-widest disabled:opacity-30">Next</button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-[440px] mx-auto text-center">
            <h2 className="font-serif text-2xl mb-8">Enhance your stay</h2>
            <div onClick={() => setCar(!car)} className={`border p-5 mb-4 cursor-pointer ${car ? "bg-cream border-clay" : "border-mist"}`}>
              <div className="flex justify-between"><span>Car Rental</span><span className="text-clay">{car ? "✓" : "€55/day"}</span></div>
            </div>
            <div onClick={() => setTransfer(!transfer)} className={`border p-5 mb-8 cursor-pointer ${transfer ? "bg-cream border-clay" : "border-mist"}`}>
              <div className="flex justify-between"><span>Airport Transfer</span><span className="text-clay">{transfer ? "✓" : "€35"}</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 p-4 border border-mist uppercase text-xs">Back</button>
              <button onClick={() => setStep(3)} className="flex-1 p-4 bg-forest text-white uppercase text-xs">Continue</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-[440px] mx-auto">
            <h2 className="font-serif text-2xl mb-8 text-center">Guest Info</h2>
            <input placeholder="First Name" onChange={e => setForm({...form, fn: e.target.value})} className="w-full p-4 border border-mist mb-3" />
            <input placeholder="Last Name" onChange={e => setForm({...form, ln: e.target.value})} className="w-full p-4 border border-mist mb-3" />
            <input placeholder="Email" onChange={e => setForm({...form, em: e.target.value})} className="w-full p-4 border border-mist mb-8" />
            <button onClick={handleReserve} disabled={bookingLoading} className="w-full p-4 bg-forest text-white uppercase text-xs tracking-widest">{bookingLoading ? "Loading..." : "Pay & Confirm"}</button>
          </div>
        )}

        {step === 4 && (() => {
          const p = new URLSearchParams(window.location.search);
          return (
            <div className="py-2 text-center">
              <div className="w-12 h-12 bg-forest/10 rounded-full flex items-center justify-center mx-auto mb-6"><Check className="text-forest" size={24} /></div>
              <h3 className="font-serif text-3xl mb-6">{isInstantBook ? "Booking Confirmed!" : "Request Received!"}</h3>
              <div className="w-full h-48 mb-6 overflow-hidden"><img src={resolveImageUrl(listing.imgs[0])} className="w-full h-full object-cover" /></div>
              <div className="bg-[#FAF9F6] p-8 border border-mist/50 mb-8 text-left">
                <p className="font-serif text-xl italic mb-4">Dear {p.get('fn') || 'Guest'},</p>
                <p className="font-serif text-[1.05rem] text-muted italic mb-8">I'm so glad you chose my {listing.name} for your stay. Helsinki is a magical city...</p>
                <p className="font-cursive text-4xl text-clay mb-0">Anna Humalainen</p>
                <p className="text-[0.6rem] uppercase tracking-widest text-muted">Host</p>
              </div>
              <div className="border-y border-mist py-6 mb-8 grid grid-cols-2 text-left gap-4">
                <div><p className="text-[0.6rem] uppercase text-muted">Dates</p><p className="text-sm">{p.get('checkIn')} — {p.get('checkOut')}</p></div>
                <div><p className="text-[0.6rem] uppercase text-muted">Guests</p><p className="text-sm">{p.get('guestCount')} Guests</p></div>
                <div><p className="text-[0.6rem] uppercase text-muted">Total Paid</p><p className="text-sm">€{p.get('total')}</p></div>
                <div><p className="text-[0.6rem] uppercase text-muted">Reference</p><p className="text-sm text-clay font-medium">Sent to email</p></div>
              </div>
              <button onClick={onClose} className="w-full p-4 bg-charcoal text-white uppercase text-xs tracking-widest">Return Home</button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
