import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { resolveImageUrl } from "../lib/imageUtils";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import { Check, MapPin, ChevronRight } from "lucide-react";
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
  const [form, setForm] = useState({ fn: "", ln: "", em: "" });
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
    document.body.style.overflow = 'hidden'; // Lock scroll only when modal is open
    return () => { document.body.style.overflow = 'unset'; }; // Cleanup on close
  }, [listing.id]);

  const calculateTotal = () => {
    if (!range.start || !range.end) return 0;
    const start = new Date(range.start);
    const end = new Date(range.end);
    let subtotal = 0;
    let n = 0;
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      const special = specialPrices.find(p => ds >= p.start_date && ds <= p.end_date);
      subtotal += special ? (special.price_override || special.price) : listing.price;
      n++;
    }
    return subtotal + (listing.cleaningFee || 0) + (car ? n * 55 : 0) + (transfer ? 35 : 0);
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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-0 md:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-charcoal/80 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal Content */}
      <div className="relative bg-warm-white w-full max-w-[1100px] max-h-[95vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
        <button onClick={onClose} className="absolute top-6 right-6 z-50 text-2xl font-light hover:rotate-90 transition-all">✕</button>

        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-8 md:p-12 border-r border-mist/20">
              <div className="aspect-[4/5] overflow-hidden mb-8 shadow-lg">
                <Swiper modules={[Navigation, Pagination, Autoplay]} navigation pagination={{ clickable: true }} loop className="h-full">
                  {listing.imgs.map((img: string, i: number) => (
                    <SwiperSlide key={i}><img src={resolveImageUrl(img)} className="w-full h-full object-cover" alt="" /></SwiperSlide>
                  ))}
                </Swiper>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-clay uppercase tracking-widest text-[0.6rem] font-bold"><MapPin size={12} /> {listing.neigh}</div>
                <h2 className="font-serif text-4xl font-light">{listing.name}</h2>
                <p className="text-muted italic font-light leading-relaxed">"{listing.desc}"</p>
              </div>
            </div>

            <div className="p-8 md:p-12 bg-cream/10">
              <h3 className="font-serif text-xl mb-6">Guests & Dates</h3>
              <div className="flex gap-2 mb-8">
                {[1, 2].map(n => (
                  <button key={n} onClick={() => setGuestCount(n)} className={`flex-1 p-4 border text-[0.7rem] tracking-widest uppercase transition-all ${guestCount === n ? "bg-charcoal text-white border-charcoal" : "bg-white text-muted border-mist hover:border-clay"}`}>{n} Guest{n > 1 ? 's' : ''}</button>
                ))}
              </div>
              <Calendar listingId={String(listing.id)} onRangeChange={setRange} specialPrices={specialPrices} basePrice={listing.price} />
              <div className="mt-10 pt-10 border-t border-mist flex justify-between items-end">
                <div><span className="text-[0.6rem] uppercase tracking-widest text-muted block mb-1">Total Stay</span><span className="font-serif text-4xl text-forest font-light">€{total}</span></div>
                <button disabled={nights === 0 || guestCount === 0} onClick={() => setStep(2)} className="bg-forest text-white px-10 py-4 uppercase text-[0.7rem] tracking-widest hover:bg-charcoal disabled:opacity-20 transition-all flex items-center gap-2">Continue <ChevronRight size={14}/></button>
              </div>
            </div>
          </div>
        )}

        {/* ... steps 2 and 3 omitted for brevity but they are standard UI containers ... */}
        {step === 2 && ( <div className="p-12 text-center max-w-[500px] mx-auto">
            <h2 className="font-serif text-3xl mb-10 font-light">Enhance Your Stay</h2>
            <div className="space-y-4 mb-10">
                <div onClick={() => setCar(!car)} className={`p-6 border text-left cursor-pointer transition-all ${car ? "bg-cream border-clay" : "border-mist"}`}>
                    <div className="flex justify-between"><strong>Car Rental</strong><span>{car ? "✓" : "€55/day"}</span></div>
                </div>
                <div onClick={() => setTransfer(!transfer)} className={`p-6 border text-left cursor-pointer transition-all ${transfer ? "bg-cream border-clay" : "border-mist"}`}>
                    <div className="flex justify-between"><strong>Airport Transfer</strong><span>{transfer ? "✓" : "€35"}</span></div>
                </div>
            </div>
            <div className="flex gap-4">
                <button onClick={() => setStep(1)} className="flex-1 p-4 border border-mist uppercase text-[0.65rem]">Back</button>
                <button onClick={() => setStep(3)} className="flex-1 p-4 bg-charcoal text-white uppercase text-[0.65rem]">Continue</button>
            </div>
        </div> )}

        {step === 3 && ( <div className="p-12 max-w-[500px] mx-auto">
            <h2 className="font-serif text-3xl mb-10 text-center font-light">Guest Details</h2>
            <div className="space-y-4 mb-10">
                <input placeholder="First Name" onChange={e => setForm({...form, fn: e.target.value})} className="w-full p-4 border border-mist outline-none" />
                <input placeholder="Last Name" onChange={e => setForm({...form, ln: e.target.value})} className="w-full p-4 border border-mist outline-none" />
                <input placeholder="Email" onChange={e => setForm({...form, em: e.target.value})} className="w-full p-4 border border-mist outline-none" />
            </div>
            <button onClick={handleReserve} disabled={bookingLoading} className="w-full p-5 bg-forest text-white uppercase text-[0.7rem] tracking-widest hover:bg-charcoal transition-all">
                {bookingLoading ? "Connecting..." : "Pay & Confirm"}
            </button>
        </div> )}

        {step === 4 && (() => {
          const p = new URLSearchParams(window.location.search);
          return (
            <div className="p-12 text-center animate-in slide-in-from-bottom duration-500">
              <div className="w-16 h-16 bg-forest/10 rounded-full flex items-center justify-center mx-auto mb-8"><Check className="text-forest" size={32} /></div>
              <h3 className="font-serif text-4xl mb-10 font-light">Booking Confirmed</h3>
              <div className="aspect-video w-full overflow-hidden mb-10 shadow-lg"><img src={resolveImageUrl(listing.imgs[0])} className="w-full h-full object-cover" /></div>
              <div className="bg-[#FAF9F6] p-10 border border-mist/50 mb-10 text-left relative italic">
                <div className="absolute top-0 left-0 w-1 h-full bg-clay/30" />
                <p className="font-serif text-2xl mb-4">Dear {p.get('fn') || 'Guest'},</p>
                <p className="font-serif text-lg leading-loose mb-10">I'm so glad you chose my {listing.name} for your stay...</p>
                <p className="font-cursive text-5xl text-clay mb-2">Anna Humalainen</p>
                <p className="text-[0.65rem] uppercase tracking-[0.3em] text-muted">Your Host</p>
              </div>
              <button onClick={onClose} className="w-full p-6 bg-charcoal text-white uppercase text-[0.7rem] tracking-widest hover:bg-forest transition-all">Return to Home</button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
