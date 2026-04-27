/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { C, LISTINGS as FALLBACK_LISTINGS, REVIEWS, FAQS, GUIDE_DATA } from "./constants";
import Calendar from "./components/Calendar";
import BookingModal from "./components/BookingModal";
import GuideModal from "./components/GuideModal";
import EventsPage from "./components/EventsPage";
import Lightbox from "./components/Lightbox";
import ChatBot from "./components/ChatBot";
import { Mail, Phone, ExternalLink, ChevronRight, Star, Check, X, Menu, Settings, RefreshCw, LogOut } from "lucide-react";
import { supabase } from "./lib/supabase";
import { resolveImageUrl } from "./lib/imageUtils";
import AdminDashboard from "./components/AdminDashboard";
import { Routes, Route, useLocation, Link, useNavigate } from "react-router-dom";
import ManageBooking from "./components/ManageBooking";
import FindBooking from "./components/FindBooking";

export default function App() {
  const navigate = useNavigate();
  const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (VITE_GEMINI_API_KEY) {
    (window as any).GEMINI_API_KEY = VITE_GEMINI_API_KEY;
  }

  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [specialPrices, setSpecialPrices] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchListings();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.email === "udy.bar.yosef@gmail.com") {
        setIsAdmin(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && session.user.email === "udy.bar.yosef@gmail.com") {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchListings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("apartments").select("*").order("id");
      const { data: priceData } = await supabase.from("apartment_prices").select("*");
      if (priceData) setSpecialPrices(priceData);

      if (error) {
        console.error("Error fetching listings from Supabase:", error);
        setListings(FALLBACK_LISTINGS);
      } else if (data && data.length > 0) {
        const mapped = data.map(l => {
          const fallback = FALLBACK_LISTINGS.find(f => String(f.id) === String(l.id));
          const images = l.images || [];
          return {
            ...l,
            neigh: l.neighborhood || l.neigh,
            price: l.price_per_night || l.price,
            desc: l.description || l.desc,
            imgs: images.length > 0 ? images : (fallback?.imgs || []),
            cleaningFee: l.cleaning_fee || l.cleaningFee,
            minStay: Number(l.min || fallback?.min || 1),
            min: Number(l.min || fallback?.min || 1),
            tags: l.tags || fallback?.tags || [],
            weekend_pricing_enabled: l.weekend_pricing_enabled,
            weekend_pricing_type: l.weekend_pricing_type,
            weekend_pricing_value: l.weekend_pricing_value
          };
        });
        setListings(mapped);
      } else {
        setListings(FALLBACK_LISTINGS);
      }
    } catch (err) {
      console.error("fetchListings error:", err);
      setListings(FALLBACK_LISTINGS);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-warm-white z-[3000] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin text-clay mx-auto mb-4" size={48} />
          <p className="font-serif text-2xl font-light tracking-wide">Anna's Stays</p>
          <p className="text-muted text-sm mt-2 font-sans tracking-widest uppercase">Loading Helsinki...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/manage-booking/:id" element={<ManageBooking listings={listings} />} />
      <Route path="/find-booking" element={<FindBooking />} />
      <Route path="/admin" element={<AdminDashboard onClose={() => { navigate("/"); }} />} />
      <Route path="/" element={<LandingPage listings={listings} specialPrices={specialPrices} fetchListings={fetchListings} isAdmin={isAdmin} />} />
    </Routes>
  );
}

function LandingPage({ listings, specialPrices, fetchListings, isAdmin }: { listings: any[], specialPrices: any[], fetchListings: () => void, isAdmin: boolean }) {
  const navigate = useNavigate();
  const [booking, setBooking] = useState<any | null>(null);
  const [guideModal, setGuideModal] = useState<any | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [lightbox, setLightbox] = useState<{ imgs: string[]; idx: number } | null>(null);
  const [activeNav, setActiveNav] = useState("stays");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // --- STRIPE SUCCESS DETECTION ---
  const [stripeSuccessStep, setStripeSuccessStep] = useState<number | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success' && listings.length > 0) {
      const aptId = params.get('apartmentId');
      const apt = listings.find(l => String(l.id) === String(aptId));
      if (apt) {
        setBooking(apt);
        setStripeSuccessStep(4); 
      }
      window.history.replaceState({}, document.title, "/");
    }
  }, [listings]);

  const refs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    stays: useRef(null), guide: useRef(null), extras: useRef(null),
    about: useRef(null), reviews: useRef(null), faq: useRef(null), contact: useRef(null)
  };

  const scrollTo = (id: string) => {
    setActiveNav(id);
    setMobileMenuOpen(false);
    const el = refs[id]?.current;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const getCurrentPrice = (listing: any) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const aptPrices = specialPrices.filter(p => p.apartment_id === listing.id);
    const event = aptPrices.find(p => p.pricing_type !== 'season' && todayStr >= p.start_date && todayStr <= p.end_date);
    if (event) return { price: event.price_override || event.price, isDynamic: true, label: "Event Rate" };
    const highSeason = aptPrices.find(p => p.pricing_type === 'season' && p.event_name?.toLowerCase().includes('high') && todayStr >= p.start_date && todayStr <= p.end_date);
    if (highSeason) {
      const day = today.getDay();
      const isWeekend = day === 5 || day === 6;
      const price = isWeekend ? (highSeason.weekend_price_override || highSeason.price_override) : highSeason.price_override;
      return { price: price, isDynamic: true, label: "High Demand" };
    }
    const day = today.getDay();
    if ((day === 5 || day === 6) && listing.weekend_pricing_enabled) {
      const base = listing.price;
      const val = listing.weekend_pricing_value || 0;
      const price = listing.weekend_pricing_type === 'percentage' ? base * (1 + val / 100) : base + val;
      return { price: Math.round(price), isDynamic: true, label: "Weekend Rate" };
    }
    return { price: listing.price, isDynamic: false, label: "" };
  };

  useEffect(() => {
    const handler = () => {
      const y = window.scrollY + 120;
      const order = ["stays", "guide", "extras", "about", "reviews", "faq", "contact"];
      for (let i = order.length - 1; i >= 0; i--) {
        const el = refs[order[i]]?.current;
        if (el && el.offsetTop <= y) { setActiveNav(order[i]); break; }
      }
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="font-sans text-charcoal bg-warmWhite min-h-screen">
      <nav className="nav-wrap flex items-center justify-between p-5 px-6 md:px-12 border-b border-mist bg-warm-white sticky top-0 z-[100] gap-4">
        <div className="font-serif text-xl md:text-2xl font-light cursor-pointer z-[101]" onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setMobileMenuOpen(false); }}>
          Anna's <em className="text-clay italic cursor-default select-none" onClick={(e) => { e.stopPropagation(); navigate("/admin"); }}>Stays</em>
        </div>
        <div className="nav-links hidden lg:flex gap-5">
          <button onClick={() => scrollTo("stays")} className={`bg-none border-none cursor-pointer font-sans text-[0.72rem] font-normal tracking-widest uppercase p-0 pb-0.5 border-b transition-all duration-200 ${activeNav === "stays" ? "text-charcoal border-charcoal" : "text-muted border-transparent"}`}>Stays</button>
          <Link to="/find-booking" className="nav-btn font-sans text-[0.72rem] tracking-widest uppercase no-underline text-muted hover:text-charcoal transition-colors">Find Booking</Link>
          <button onClick={() => scrollTo("guide")} className={`bg-none border-none cursor-pointer font-sans text-[0.72rem] font-normal tracking-widest uppercase p-0 pb-0.5 border-b transition-all duration-200 ${activeNav === "guide" ? "text-charcoal border-charcoal" : "text-muted border-transparent"}`}>Helsinki Guide</button>
          <button onClick={() => scrollTo("extras")} className={`bg-none border-none cursor-pointer font-sans text-[0.72rem] font-normal tracking-widest uppercase p-0 pb-0.5 border-b transition-all duration-200 ${activeNav === "extras" ? "text-charcoal border-charcoal" : "text-muted border-transparent"}`}>Extras</button>
          <button onClick={() => scrollTo("reviews")} className={`bg-none border-none cursor-pointer font-sans text-[0.72rem] font-normal tracking-widest uppercase p-0 pb-0.5 border-b transition-all duration-200 ${activeNav === "reviews" ? "text-charcoal border-charcoal" : "text-muted border-transparent"}`}>Reviews</button>
          <button onClick={() => scrollTo("faq")} className={`bg-none border-none cursor-pointer font-sans text-[0.72rem] font-normal tracking-widest uppercase p-0 pb-0.5 border-b transition-all duration-200 ${activeNav === "faq" ? "text-charcoal border-charcoal" : "text-muted border-transparent"}`}>FAQ</button>
          <button onClick={() => scrollTo("about")} className={`bg-none border-none cursor-pointer font-sans text-[0.72rem] font-normal tracking-widest uppercase p-0 pb-0.5 border-b transition-all duration-200 ${activeNav === "about" ? "text-charcoal border-charcoal" : "text-muted border-transparent"}`}>About</button>
          <button onClick={() => scrollTo("contact")} className={`bg-none border-none cursor-pointer font-sans text-[0.72rem] font-normal tracking-widest uppercase p-0 pb-0.5 border-b transition-all duration-200 ${activeNav === "contact" ? "text-charcoal border-charcoal" : "text-muted border-transparent"}`}>Contact</button>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => scrollTo("contact")} className="hidden sm:block bg-forest text-white font-sans text-[0.72rem] tracking-widest uppercase p-2.5 px-5.5 border-none cursor-pointer hover:bg-forest/90 transition-colors">Book Now</button>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden bg-none border-none cursor-pointer text-charcoal z-[101] p-1">{mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}</button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="hero-grid grid grid-cols-1 lg:grid-cols-2 min-h-[90vh]">
        <div className="hero-left bg-cream flex flex-col justify-center p-10 md:p-24">
          <h1 className="hero-title font-serif text-[4.5rem] md:text-[6.5rem] font-light leading-[0.95] mb-10">Your home<br />in <em className="text-forest italic">Helsinki,</em>awaits.</h1>
          <div className="flex gap-4">
            <button onClick={() => scrollTo("stays")} className="bg-forest text-white p-4.5 px-10 font-sans text-[0.7rem] uppercase tracking-widest">Explore stays</button>
          </div>
        </div>
        <div className="hero-right grid grid-cols-[1.6fr_1fr] grid-rows-2 gap-0.5 bg-mist">
          {listings.slice(0, 3).map((l, i) => (
            <div key={l.id} className={`relative cursor-pointer ${i === 0 ? 'row-span-2' : ''}`} onClick={() => scrollTo("stays")}>
              <img src={resolveImageUrl(l.imgs[0])} className="absolute inset-0 w-full h-full object-cover" />
              <span className="absolute bottom-4 left-4 bg-charcoal/50 text-white p-1 px-3 text-[0.6rem] tracking-widest uppercase">{l.neigh}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stays Section */}
      <div ref={refs.stays} className="sec-pad p-10 md:p-24 px-6 md:px-12 scroll-mt-[70px]">
        <div className="flex justify-between items-end mb-16">
          <h2 className="font-serif text-5xl md:text-6xl font-light">Our Studios</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {listings.map(l => (
            <div key={l.id} className="bg-warm-white border border-mist shadow-sm hover:shadow-xl transition-all">
              <div className="h-[240px] cursor-zoom-in" onClick={() => setLightbox({ imgs: l.imgs, idx: 0 })}>
                <img src={resolveImageUrl(l.imgs[0])} className="w-full h-full object-cover" />
              </div>
              <div className="p-8">
                <p className="text-[0.62rem] text-clay uppercase tracking-widest mb-1">{l.neigh}</p>
                <h3 className="font-serif text-2xl font-light mb-4">{l.name}</h3>
                <button onClick={() => { localStorage.setItem('last_booked_id', String(l.id)); setBooking(l); }} className="w-full border border-birch p-3 font-sans text-[0.7rem] tracking-widest uppercase hover:bg-forest hover:text-white transition-all">View & Book</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Helsinki Guide Section */}
      <div ref={refs.guide} className="bg-cream py-24 scroll-mt-[70px]">
        <div className="container mx-auto px-6 md:px-12">
          <h2 className="font-serif text-5xl font-light mb-12">Helsinki Guide</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.keys(GUIDE_DATA).map(cat => (
              <div key={cat} onClick={() => setGuideModal(cat)} className="bg-white p-8 border border-mist cursor-pointer hover:border-clay transition-colors group">
                <h3 className="font-serif text-xl capitalize mb-2">{cat}</h3>
                <p className="text-muted text-[0.65rem] uppercase tracking-widest group-hover:text-clay">Explore →</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Extras Section */}
      <div ref={refs.extras} className="py-24 border-y border-mist scroll-mt-[70px]">
        <div className="container mx-auto px-6 text-center">
            <h2 className="font-serif text-5xl font-light mb-12">Extras</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
                <div className="text-left p-10 bg-warm-white border border-mist">
                    <h3 className="font-serif text-2xl mb-4">Car Rental</h3>
                    <p className="text-muted text-sm leading-relaxed mb-6">Private car rental ready at your apartment. €55 / day.</p>
                </div>
                <div className="text-left p-10 bg-warm-white border border-mist">
                    <h3 className="font-serif text-2xl mb-4">Airport Transfer</h3>
                    <p className="text-muted text-sm leading-relaxed mb-6">Hassle-free pickup from Helsinki-Vantaa. €35 flat rate.</p>
                </div>
            </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div ref={refs.reviews} className="py-24 bg-charcoal text-cream scroll-mt-[70px]">
        <div className="container mx-auto px-6 text-center">
            <Star className="text-clay mx-auto mb-8" />
            <p className="font-serif text-3xl md:text-4xl font-light max-w-3xl mx-auto leading-tight italic">
                "{REVIEWS[reviewIdx].text}"
            </p>
            <p className="mt-8 text-clay uppercase tracking-widest text-xs">- {REVIEWS[reviewIdx].author}</p>
        </div>
      </div>

      {/* FAQ Section */}
      <div ref={refs.faq} className="py-24 scroll-mt-[70px]">
        <div className="max-w-3xl mx-auto px-6">
            <h2 className="font-serif text-5xl font-light mb-12 text-center">FAQ</h2>
            <div className="space-y-4">
                {FAQS.map((faq, i) => (
                    <div key={i} className="border-b border-mist pb-4">
                        <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full text-left flex justify-between items-center py-4 group">
                            <span className="font-serif text-xl group-hover:text-clay transition-colors">{faq.q}</span>
                            <span className="text-clay">{openFaq === i ? '−' : '+'}</span>
                        </button>
                        <AnimatePresence>
                          {openFaq === i && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <p className="text-muted text-sm pb-4">{faq.a}</p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* Contact Section */}
      <div ref={refs.contact} className="py-32 border-t border-mist bg-warm-white scroll-mt-[70px]">
          <div className="container mx-auto px-6 text-center">
              <h2 className="font-serif text-6xl font-light mb-8 italic">Say Hello</h2>
              <p className="text-muted text-xl">hello@annasstays.fi</p>
          </div>
      </div>

      {/* Footer */}
      <footer className="bg-charcoal p-12 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="font-serif text-xl text-cream">Anna's <em className="text-clay italic">Stays</em></div>
        <div className="text-mist text-xs uppercase tracking-widest font-sans">© 2026 Anna's Stays Helsinki</div>
        <div className="text-mist text-xs font-sans">hello@annasstays.fi</div>
      </footer>

      {/* Modals & Widgets */}
      {booking && (
        <BookingModal 
          listing={booking} 
          onClose={() => { setBooking(null); setStripeSuccessStep(undefined); }} 
          initialStep={stripeSuccessStep}
        />
      )}
      {guideModal && <GuideModal category={guideModal} onClose={() => setGuideModal(null)} />}
      {showEvents && <EventsPage onClose={() => setShowEvents(false)} />}
      {lightbox && <Lightbox imgs={lightbox.imgs} startIdx={lightbox.idx} onClose={() => setLightbox(null)} />}
      <ChatBot listings={listings} onBookNow={(id) => {
        const apt = listings.find(l => String(l.id) === String(id));
        if (apt) { localStorage.setItem('last_booked_id', String(apt.id)); setBooking(apt); }
      }} />
    </div>
  );
}
