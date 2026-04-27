import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { resolveImageUrl } from "../lib/imageUtils";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import { Check, RefreshCw, ChevronRight, MapPin, Users, Calendar as CalIcon } from "lucide-react";
import Calendar from "./Calendar";

// Swiper Styles
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
    // Scroll to top when modal opens
    window.scrollTo(0, 0);
  }, [listing.id]);

  const calculateBreakdown = () => {
    if (!range.start || !range.end) return { nights: 0, subtotal: 0, total: 0 };
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
    const cleaning = listing.cleaningFee || 0;
    const carFee = car ? n * 55 : 0;
    const tfFee = transfer ? 35 : 0;
    return { nights: n, subtotal, total: subtotal + cleaning + carFee + tfFee };
  };

  const { nights, total } = calculateBreakdown();

  const handleReserve = async () => {
    if (!form.fn || !form.em) return alert("Please provide your name and email.");
    setBookingLoading(true);
    try {
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
    } catch (e) {
      console.error(e);
      alert("Payment failed to initialize.");
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-charcoal/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-0 md:p-4 overflow-y-auto">
      <div className={`bg-warm-white w-full ${step === 1 ? "max-w-[1100px]" : "max-w-[600px]"} min-h-screen md:min-h-0 shadow-2xl relative font-sans animate-in fade-in zoom-in duration-300`}>
        
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-6 right-6 text-charcoal hover:rotate-90 transition-transform duration-300 z-[100]">
          <span className="text-2xl font-light">✕</span>
        </button>

        {step < 4 && (
          <div className="flex px-10 pt-10 gap-4 mb-8 max-w-[400px] mx-auto">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${step >= s ? "bg-forest" : "bg-mist"}`} />
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left: Gallery & Info */}
            <div className="p-8 md:p-12 border-r border-mist/30">
              <div className="aspect-[4/5] w-full overflow-hidden mb-8 shadow-lg">
                <Swiper modules={[Navigation, Pagination, Autoplay]} navigation pagination={{ clickable: true }} autoplay={{ delay: 5000 }} loop className="h-full group">
                  {listing.imgs.map((img: string, i: number) => (
                    <SwiperSlide key={i}>
                      <img src={resolveImageUrl(img)} className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" alt="" />
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-clay uppercase tracking-[0.2em] text-[0.65rem] font-medium">
                  <MapPin size={12} /> {listing.neigh}
                </div>
                <h2 className="font-serif text-4xl text-charcoal font-light leading-tight">{listing.name}</h2>
                <p className="text-muted leading-relaxed font-light italic">"{listing.desc}"</p>
              </div>
            </div>

            {/* Right: Booking Engine */}
            <div className="p-8 md:p-12 bg-cream/20">
              <div className="mb-10">
                <label className="text-[0.6rem] uppercase tracking-widest text-muted block mb-4 font-bold">1. Number of Guests</label>
                <div className="flex gap-3">
                  {[1, 2].map(n => (
                    <button key={n} onClick={() => setGuestCount(n)} className={`flex-1 py-4 border transition-all duration-300 font-sans text-xs tracking-widest ${guestCount === n ? "bg-charcoal text-white border-charcoal shadow-md" : "bg-white text-muted border-mist hover:border-clay"}`}>
                      {n} {n === 1 ? "GUEST" : "GUESTS"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-10">
                <label className="text-[0.6rem] uppercase tracking-widest text-muted block mb-4 font-bold">2. Select Dates</label>
                <Calendar listingId={String(listing.id)} onRangeChange={setRange} specialPrices={specialPrices} basePrice={listing.price} />
              </div>

              <div className="border-t border-mist pt-8">
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <span className="text-[0.6rem] uppercase tracking-widest text-muted block mb-1">Total Stay</span>
                    <span className="font-serif text-4xl text-forest font-light">€{total}</span>
                  </div>
                  <button 
                    disabled={nights === 0 || guestCount === 0} 
                    onClick={() => setStep(2)} 
                    className="group flex items-center gap-3 bg-forest text-white px-8 py-4 uppercase text-[0.7rem] tracking-[0.2em] hover:bg-charcoal transition-all disabled:opacity-20 disabled:grayscale"
                  >
                    Continue <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-12 text-center max-w-[500px] mx-auto">
            <h2 className="font-serif text-3xl mb-4 font-light text-charcoal">Enhance Your Experience</h2>
            <p className="text-muted text-sm font-light mb-10 leading-relaxed italic">Make your stay in Helsinki even more comfortable with our premium extras.</p>
            
            <div className="space-y-4 mb-12">
              {[
                { k: "car", l: "Private Car Rental", s: "Ready at your apartment upon arrival.", p: "€55 / day", v: car, f: setCar },
                { k: "tf", l: "Airport Transfer", s: "Meet & greet at Helsinki-Vantaa.", p: "€35 flat", v: transfer, f: setTransfer }
              ].map(x => (
                <div key={x.k} onClick={() => x.f(!x.v)} className={`group p-6 border text-left cursor-pointer transition-all duration-500 ${x.v ? "bg-cream border-clay ring-1 ring-clay" : "bg-white border-mist hover:border-clay"}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-serif text-lg text-charcoal">{x.l}</span>
                    <span className={`text-[0.65rem] tracking-widest font-bold ${x.v ? "text-clay" : "text-muted"}`}>{x.v ? "✓ SELECTED" : x.p}</span>
                  </div>
                  <p className="text-xs text-muted font-light">{x.s}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="flex-1 p-5 border border-mist uppercase text-[0.65rem] tracking-widest hover:bg-mist/10 transition-colors">Back</button>
              <button onClick={() => setStep(3)} className="flex-[2] p-5 bg-charcoal text-white uppercase text-[0.65rem] tracking-widest hover:bg-forest transition-colors">Review Guest Details</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-12 max-w-[500px] mx-auto">
            <h2 className="font-serif text-3xl mb-10 text-center font-light">Guest Information</h2>
            <div className="space-y-4 mb-10">
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="First Name" className="w-full p-4 bg-cream/10 border border-mist focus:border-clay outline-none font-light text-sm" onChange={e => setForm({...form, fn: e.target.value})} />
                <input placeholder="Last Name" className="w-full p-4 bg-cream/10 border border-mist focus:border-clay outline-none font-light text-sm" onChange={e => setForm({...form, ln: e.target.value})} />
              </div>
              <input placeholder="Email Address" className="w-full p-4 bg-cream/10 border border-mist focus:border-clay outline-none font-light text-sm" onChange={e => setForm({...form, em: e.target.value})} />
            </div>
            
            <div className="bg-forest/5 p-6 border-l-2 border-forest mb-10">
              <p className="text-[0.7rem] text-muted italic leading-relaxed">
                {isInstantBook 
                  ? "Your reservation will be confirmed immediately after payment." 
                  : "Your payment will be authorized, and the booking will be confirmed upon host approval."}
              </p>
            </div>

            <div className="flex gap-4">
              <button onClick={() => setStep(2)} className="flex-1 p-5 border border-mist uppercase text-[0.65rem] tracking-widest">Back</button>
              <button onClick={handleReserve} disabled={bookingLoading} className="flex-[2] p-5 bg-forest text-white uppercase text-[0.65rem] tracking-widest hover:bg-charcoal transition-all disabled:opacity-50">
                {bookingLoading ? "Connecting to Stripe..." : "Confirm & Pay"}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (() => {
          const p = new URLSearchParams(window.location.search);
          return (
            <div className="p-12 text-center animate-in slide-in-from-bottom duration-700">
              <div className="w-16 h-16 bg-forest/10 rounded-full flex items-center justify-center mx-auto mb-8">
                <Check className="text-forest" size={32} />
              </div>
              <h3 className="font-serif text-4xl mb-10 font-light text-charcoal">{isInstantBook ? "Booking Confirmed" : "Request Received"}</h3>
              
              <div className="aspect-video w-full overflow-hidden mb-10 shadow-lg border border-mist/20">
                <img src={resolveImageUrl(listing.imgs[0])} className="w-full h-full object-cover" alt="" />
              </div>

              <div className="bg-[#FAF9F6] p-10 border border-mist/50 mb-10 relative text-left shadow-sm italic">
                <div className="absolute top-0 left-0 w-1 h-full bg-clay/30" />
                <p className="font-serif text-2xl text-charcoal mb-6 font-light">Dear {p.get('fn') || 'Guest'},</p>
                <p className="font-serif text-[1.1rem] text-muted leading-loose mb-10">
                  I'm so glad you chose my {listing.name} for your stay. Helsinki is a magical city, and we've prepared everything to make your visit truly special. We'll send your personal entry codes 24 hours before you arrive.
                </p>
                <p className="font-cursive text-5xl text-clay mb-2">Anna Humalainen</p>
                <p className="text-[0.65rem] uppercase tracking-[0.3em] text-muted font-medium">Your Host</p>
              </div>

              <div className="grid grid-cols-2 gap-8 text-left mb-12 py-8 border-y border-mist/40">
                <div>
                  <p className="text-[0.6rem] uppercase tracking-widest text-muted mb-2 font-bold">Dates</p>
                  <p className="text-sm font-sans">{p.get('checkIn')} — {p.get('checkOut')}</p>
                </div>
                <div>
                  <p className="text-[0.6rem] uppercase tracking-widest text-muted mb-2 font-bold">Guests</p>
                  <p className="text-sm font-sans">{p.get('guestCount')} Guests</p>
                </div>
                <div>
                  <p className="text-[0.6rem] uppercase tracking-widest text-muted mb-2 font-bold">Total Paid</p>
                  <p className="text-sm font-sans font-medium text-forest text-lg">€{p.get('total')}</p>
                </div>
                <div>
                  <p className="text-[0.6rem] uppercase tracking-widest text-muted mb-2 font-bold">Reference</p>
                  <p className="text-[0.7rem] font-sans font-bold text-clay bg-clay/5 px-2 py-1 inline-block">CHECK EMAIL</p>
                </div>
              </div>

              <button onClick={onClose} className="w-full p-6 bg-charcoal text-white uppercase text-[0.7rem] tracking-[0.3em] hover:bg-forest transition-all shadow-xl">
                Return to Anna's Stays
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
