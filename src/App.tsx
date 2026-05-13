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
import { Mail, Phone, ExternalLink, ChevronRight, Star, Check, X, Menu, Settings, RefreshCw, LogOut, Home, Map, MessageCircle, CalendarDays } from "lucide-react";
import { supabase } from "./lib/supabase";
import { resolveImageUrl } from "./lib/imageUtils";
import AdminDashboard from "./components/AdminDashboard";
import { Routes, Route, useLocation, Link, useNavigate } from "react-router-dom";
import ManageBooking from "./components/ManageBooking";
import FindBooking from "./components/FindBooking";
import BookingSuccess from "./components/BookingSuccess";

export default function App() {
  const navigate = useNavigate();
  const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (VITE_GEMINI_API_KEY) {
    (window as any).GEMINI_API_KEY = VITE_GEMINI_API_KEY;
  }

  const [listings, setListings] = useState<typeof FALLBACK_LISTINGS>([]);
  const [loading, setLoading] = useState(true);
  const [specialPrices, setSpecialPrices] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchListings();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.email === "udy.bar.yosef@gmail.com") setIsAdmin(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && session.user.email === "udy.bar.yosef@gmail.com") setIsAdmin(true);
      else setIsAdmin(false);
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
      <Route path="/booking-success" element={<BookingSuccess />} />
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
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // Contact form state
  const [contactForm, setContactForm] = useState({
    firstName: "", lastName: "", email: "", apartment: "", checkIn: "", checkOut: "", message: ""
  });
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const refs: Record<string, React.RefObject<HTMLDivElement | null>> = {
    stays: useRef(null),
    guide: useRef(null),
    extras: useRef(null),
    about: useRef(null),
    reviews: useRef(null),
    faq: useRef(null),
    contact: useRef(null)
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
      return { price, isDynamic: true, label: "High Demand" };
    }
    const day = today.getDay();
    const isWeekend = day === 5 || day === 6;
    if (isWeekend && listing.weekend_pricing_enabled) {
      const base = listing.price;
      const val = listing.weekend_pricing_value || 0;
      const price = listing.weekend_pricing_type === 'percentage' ? base * (1 + val / 100) : base + val;
      return { price: Math.round(price), isDynamic: true, label: "Weekend Rate" };
    }
    return { price: listing.price, isDynamic: false, label: "" };
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('openHelsinki') === 'true') {
      setShowEvents(true);
      params.delete('openHelsinki');
      const newSearch = params.toString();
      window.history.replaceState(null, '', newSearch ? '?' + newSearch : window.location.pathname);
    }
  }, []);

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

  const handleContactSubmit = async () => {
    if (!contactForm.firstName.trim() || !contactForm.email.trim()) {
      setContactError("Please fill in your first name and email address.");
      return;
    }
    setContactSubmitting(true);
    setContactError(null);
    try {
// Email 1 — notification to Anna at info@anna-stays.fi
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "info@anna-stays.fi",
          subject: "New Enquiry from " + contactForm.firstName.trim() + " " + contactForm.lastName.trim() + " | Anna's Stays",
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">New Enquiry Received</h2><p><strong>Name:</strong> ' + contactForm.firstName.trim() + ' ' + contactForm.lastName.trim() + '</p><p><strong>Email:</strong> <a href="mailto:' + contactForm.email.trim() + '">' + contactForm.email.trim() + '</a></p><p><strong>Apartment:</strong> ' + (contactForm.apartment || 'Not specified') + '</p><p><strong>Check-in:</strong> ' + (contactForm.checkIn || 'Not specified') + '</p><p><strong>Check-out:</strong> ' + (contactForm.checkOut || 'Not specified') + '</p><p><strong>Message:</strong><br>' + (contactForm.message || 'No message provided') + '</p><p style="margin-top:24px;font-size:0.8rem;color:#7A756E;">Reply directly to this email to respond to the guest.</p></div>',
        }),
      });

      // Email 2 — acknowledgement to guest
      await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: contactForm.email.trim(),
          subject: "We received your enquiry | Anna's Stays",
          html: '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;"><h2 style="font-weight:normal;">Thank you, ' + contactForm.firstName.trim() + '</h2><p>We have received your enquiry and will get back to you within the hour.</p>' + (contactForm.checkIn ? '<p><strong>Dates:</strong> ' + contactForm.checkIn + ' to ' + contactForm.checkOut + '</p>' : '') + (contactForm.apartment ? '<p><strong>Apartment:</strong> ' + contactForm.apartment + '</p>' : '') + '<p style="margin-top:24px;font-style:italic;color:#5C7A5C;">— Anna Humalainen, Host</p><p style="font-size:0.8rem;color:#7A756E;">info@anna-stays.fi</p></div>',
        }),
      });

      // ntfy to Anna's phone
      fetch("https://ntfy.sh/annas-stays-helsinki-99", {
        method: "POST",
        body: "New enquiry from " + contactForm.firstName.trim() + " " + contactForm.lastName.trim() + " (" + contactForm.email.trim() + ")" + (contactForm.checkIn ? " | " + contactForm.checkIn + " to " + contactForm.checkOut : "") + (contactForm.apartment ? " | " + contactForm.apartment : ""),
        headers: { "Title": "New Enquiry", "Priority": "default", "Content-Type": "text/plain" },
      }).catch(() => {});

      setContactSent(true);
      setContactForm({ firstName: "", lastName: "", email: "", apartment: "", checkIn: "", checkOut: "", message: "" });
    } catch (err) {
      setContactError("Something went wrong. Please email us directly at info@anna-stays.fi");
    } finally {
      setContactSubmitting(false);
    }
  };

  const navBtn = (id: string, label: string) => (
    <button
      key={id}
      onClick={() => scrollTo(id)}
      className={`bg-none border-none cursor-pointer font-sans text-[0.72rem] font-normal tracking-widest uppercase p-0 pb-0.5 border-b transition-all duration-200 whitespace-nowrap ${activeNav === id ? "text-charcoal border-charcoal" : "text-muted border-transparent"}`}
    >
      {label}
    </button>
  );

  return (
    <>
    <div className="hidden lg:block">
    <div className="font-sans text-charcoal bg-warmWhite min-h-screen">
      {/* NAV */}
      <nav className="nav-wrap flex items-center justify-between p-5 px-6 md:px-12 border-b border-mist bg-warm-white sticky top-0 z-[100] gap-4">
        <div
          className="font-serif text-xl md:text-2xl font-light cursor-pointer z-[101]"
          onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setMobileMenuOpen(false); }}
        >
          Anna's <em className="text-clay italic cursor-default select-none" onClick={(e) => { e.stopPropagation(); navigate("/admin"); }}>Stays</em>
        </div>
        <div className="nav-links hidden lg:flex gap-5">
          {navBtn("stays", "Stays")}
          <Link to="/find-booking" className="nav-btn font-sans text-[0.72rem] tracking-widest uppercase no-underline text-muted hover:text-charcoal transition-colors flex items-center gap-1.5">
            Find Booking
          </Link>
          {navBtn("guide", "Helsinki Guide")}
          {navBtn("extras", "Extras")}
          {navBtn("reviews", "Reviews")}
          {navBtn("faq", "FAQ")}
          {navBtn("about", "About")}
          {navBtn("contact", "Contact")}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => scrollTo("contact")}
            className="hidden sm:block bg-forest text-white font-sans text-[0.72rem] tracking-widest uppercase p-2.5 px-5.5 border-none cursor-pointer whitespace-nowrap hover:bg-forest/90 transition-colors"
          >
            Book Now
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden bg-none border-none cursor-pointer text-charcoal z-[101] p-1"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed inset-0 bg-warm-white z-[100] flex flex-col items-center justify-center gap-8 lg:hidden"
            >
              <div className="flex flex-col items-center gap-6">
                <Link to="/find-booking" className="bg-none border-none cursor-pointer font-serif text-2xl font-light text-charcoal no-underline hover:text-clay transition-colors" onClick={() => setMobileMenuOpen(false)}>
                  Find My Booking
                </Link>
                {["stays", "guide", "extras", "reviews", "faq", "about", "contact"].map((id) => (
                  <button key={id} onClick={() => scrollTo(id)} className={`bg-none border-none cursor-pointer font-serif text-2xl font-light transition-all duration-200 ${activeNav === id ? "text-forest italic" : "text-charcoal"}`}>
                    {id.charAt(0).toUpperCase() + id.slice(1).replace("faq", "FAQ").replace("guide", "Helsinki Guide")}
                  </button>
                ))}
                {isAdmin && (
                  <button onClick={async () => { await supabase.auth.signOut(); setMobileMenuOpen(false); navigate("/"); }} className="bg-none border-none cursor-pointer font-serif text-2xl font-light text-clay no-underline hover:opacity-80 transition-opacity flex items-center gap-2">
                    Logout <LogOut size={20} />
                  </button>
                )}
              </div>
              <button onClick={() => scrollTo("contact")} className="mt-4 bg-forest text-white font-sans text-[0.8rem] tracking-widest uppercase p-4 px-10 border-none cursor-pointer hover:bg-forest/90 transition-colors">
                Book Your Stay
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* HERO */}
      <div className="hero-grid grid grid-cols-1 lg:grid-cols-2 min-h-[90vh]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="hero-left bg-cream flex flex-col justify-center p-10 md:p-24 px-6 md:px-20">
          <h1 className="hero-title font-serif text-[4.5rem] md:text-[6.5rem] font-light leading-[0.95] mb-10">
            Your home<br />in <em className="text-forest italic">Helsinki,</em><br />awaits.
          </h1>
          <p className="text-[1rem] font-light text-muted leading-relaxed max-w-[440px] mb-12">
            Three carefully designed apartments across the city's most characterful neighbourhoods. Hosted personally by Anna and her partner.
          </p>
          <div className="flex gap-4 flex-wrap">
            <button onClick={() => scrollTo("stays")} className="bg-forest text-white border-none p-4.5 px-10 font-sans text-[0.7rem] tracking-[0.15em] uppercase cursor-pointer hover:bg-forest/90 transition-colors">Explore stays</button>
            <button onClick={() => scrollTo("guide")} className="bg-transparent text-charcoal border border-birch p-4.5 px-10 font-sans text-[0.7rem] tracking-[0.15em] uppercase cursor-pointer hover:bg-warm-white transition-colors">Discover Helsinki</button>
          </div>
        </motion.div>
        <div className="hero-right grid grid-cols-[1.6fr_1fr] grid-rows-2 gap-0.5 bg-mist">
          <div className="img-zoom-container cursor-pointer relative row-span-2 flex items-end p-6" onClick={() => scrollTo("stays")}>
            {(() => { const l = listings.find(x => x.neigh?.includes("Etu-Töölö")); return l && (<><img src={resolveImageUrl(l.imgs[0])} alt={l.name} className="absolute inset-0 w-full h-full object-cover" /><span className="text-[0.6rem] tracking-widest uppercase text-white bg-charcoal/50 p-1.5 px-3 relative z-[1]">Etu-Töölö</span></>); })()}
          </div>
          <div className="img-zoom-container cursor-pointer relative flex items-end p-4" onClick={() => scrollTo("stays")}>
            {(() => { const l = listings.find(x => x.neigh?.includes("Kallio")); return l && (<><img src={resolveImageUrl(l.imgs[0])} alt={l.name} className="absolute inset-0 w-full h-full object-cover" /><span className="text-[0.6rem] tracking-widest uppercase text-white bg-charcoal/50 p-1.5 px-3 relative z-[1]">Kallio</span></>); })()}
          </div>
          <div className="img-zoom-container cursor-pointer relative flex items-end p-4" onClick={() => scrollTo("stays")}>
            {(() => { const l = listings.find(x => x.neigh?.includes("Roihuvuori")); return l && (<><img src={resolveImageUrl(l.imgs[0])} alt={l.name} className="absolute inset-0 w-full h-full object-cover" /><span className="text-[0.6rem] tracking-widest uppercase text-white bg-charcoal/50 p-1.5 px-3 relative z-[1]">Roihuvuori</span></>); })()}
          </div>
        </div>
      </div>

      {/* STATS */}
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="grid grid-cols-1 md:grid-cols-3 border-t border-b border-mist">
        {[["240+", "Guest reviews"], ["4.8", "Average rating"], [listings.length.toString(), "Design apartments"]].map(([n, l], idx) => (
          <motion.div key={l} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: idx * 0.1 }} className="p-8 border-b md:border-b-0 md:border-r border-mist last:border-r-0 text-center">
            <span className="font-serif text-[2.8rem] font-light block leading-none mb-1.5">{n}</span>
            <span className="text-[0.66rem] tracking-widest uppercase text-muted font-sans">{l}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* STAYS */}
      <motion.div ref={refs.stays} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8, ease: "easeOut" }} className="sec-pad p-10 md:p-24 px-6 md:px-12 scroll-mt-[70px]">
        <p className="text-[0.68rem] tracking-[0.22em] uppercase text-clay mb-3 font-sans">Our Apartments</p>
        <h2 className="font-serif text-[2.2rem] md:text-[2.8rem] font-light mb-3 leading-[1.15]">Choose your <em className="italic">perfect stay</em></h2>
        <p className="text-sm text-muted leading-loose max-w-[500px] mb-12 font-light">Each apartment is individually designed with attention to detail — located in Helsinki's most walkable, vibrant neighbourhoods.</p>
        <div className="stays-grid grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {listings && listings.length > 0 ? listings.map((l, idx) => (
            <motion.div key={l.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: idx * 0.1 }} whileHover={{ y: -10 }} className="bg-warm-white transition-all duration-300 flex flex-col shadow-sm hover:shadow-xl border border-mist">
              <div className="img-zoom-container h-[240px] bg-mist cursor-zoom-in shrink-0" onClick={() => setLightbox({ imgs: l.imgs, idx: 0 })}>
                <img src={resolveImageUrl(l.imgs[0])} alt={l.name} className="w-full h-full object-cover block" />
                <span className="absolute bottom-3 left-3 text-[0.6rem] tracking-widest uppercase bg-warm-white text-charcoal p-1 px-3 font-sans z-[2]">
                  {(() => {
                    const ratingNum = typeof l.rating === 'string' ? parseFloat(l.rating.replace(/[^\d.]/g, '')) : Number(l.rating);
                    const isSuperhost = ratingNum >= 4.8;
                    const displayRating = typeof l.rating === 'string' && l.rating.includes('★') ? l.rating.split(' ·')[0] : `★ ${l.rating || '5.0'}`;
                    return <>{isSuperhost && "Superhost · "}{displayRating}</>;
                  })()}
                </span>
                <span className="absolute bottom-3 right-3 text-[0.6rem] text-white bg-black/30 p-1 px-2 font-sans z-[2]">1 / {l.imgs?.length || 0}</span>
              </div>
              <div className="p-7 px-8 flex flex-col flex-1">
                <p className="text-[0.62rem] tracking-widest uppercase text-clay mb-1 font-sans">{l.neigh}</p>
                <h3 className="font-serif text-[1.45rem] font-light mb-2 leading-[1.25]">{l.name}</h3>
                <p className="text-[0.8rem] text-muted leading-relaxed mb-3 font-light">{l.desc?.substring(0, 100)}...</p>
                <div className="flex gap-1.5 flex-wrap mb-3.5">
                  {l.tags?.slice(0, 5).map((t: string) => (
                    <span key={t} className="text-[0.58rem] tracking-widest uppercase border border-mist text-muted p-1 px-2 font-sans">{t}</span>
                  ))}
                </div>
                <div className="mt-auto">
                  <div className="flex justify-between items-center pt-4 border-t border-mist mb-4">
                    <div className="flex flex-col">
                      {(() => {
                        const { price, isDynamic, label } = getCurrentPrice(l);
                        return (
                          <div className="font-serif text-[1.45rem] font-light flex items-center gap-2">
                            €{price}
                            <span className="font-sans text-[0.7rem] text-muted font-light">/ night</span>
                            {isDynamic && <span className="text-[0.55rem] tracking-[0.1em] uppercase bg-clay/10 text-clay px-1.5 py-0.5 font-sans font-medium">{label}</span>}
                          </div>
                        );
                      })()}
                      {l.cleaningFee && <div className="text-[0.6rem] text-muted font-sans tracking-wider">+ €{l.cleaningFee} cleaning fee</div>}
                    </div>
                    <div className="text-[0.68rem] text-muted text-right leading-relaxed font-sans">{l.size} · {l.guests} guests<br />Min. {l.min} {l.min === 1 ? 'night' : 'nights'} stay</div>
                  </div>
                  <button
                    onClick={() => setBooking(l)}
                    className="bg-transparent border border-birch text-charcoal font-sans text-[0.7rem] tracking-widest uppercase p-3 cursor-pointer w-full hover:bg-forest hover:text-white hover:border-forest transition-all duration-200"
                  >
                    {l.is_instant_book !== false ? "View & Book" : "Request to Stay"}
                  </button>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="col-span-3 py-20 text-center bg-warm-white">
              <RefreshCw className="animate-spin text-clay mx-auto mb-4" size={40} />
              <p className="font-serif text-xl">Loading Helsinki Stays...</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* GUIDE */}
      <motion.div ref={refs.guide} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} className="sec-pad bg-cream p-10 md:p-24 px-6 md:px-12 scroll-mt-[70px]">
        <div className="guide-grid grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-12 lg:gap-20 items-start">
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2 }}>
            <p className="text-[0.68rem] tracking-[0.22em] uppercase text-clay mb-3 font-sans">Helsinki Guide</p>
            <h2 className="font-serif text-[2.4rem] font-light mb-3 leading-[1.15]">Discover the city<br /><em className="italic">like a local</em></h2>
            <p className="text-[0.88rem] text-muted leading-loose mb-8 font-light">Anna's personal picks — restaurants, cafés, saunas, day trips, and hidden gems. Click any category to explore the top 10.</p>
            <button onClick={() => setShowEvents(true)} className="bg-forest text-white border-none p-3.5 px-8 font-sans text-xs tracking-widest uppercase cursor-pointer hover:bg-forest/90 transition-colors">
              This week in Helsinki →
            </button>
          </motion.div>
          <div className="guide-cards grid grid-cols-1 sm:grid-cols-2 gap-0.5 bg-mist">
            {GUIDE_DATA.map((g, idx) => (
              <motion.div key={g.title} initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: idx * 0.1 }} onClick={() => setGuideModal(g)} whileHover={{ backgroundColor: "#f0ece5", y: -5 }} className="bg-warm-white p-7 cursor-pointer transition-all duration-300">
                <div className="text-lg mb-3" style={{ color: g.color }}>{g.icon}</div>
                <p className="font-serif text-[1.15rem] font-light mb-1">{g.title}</p>
                <p className="text-[0.76rem] text-muted leading-relaxed font-light mb-2.5">{g.places[0].name}, {g.places[1].name} & more</p>
                <span className="text-[0.62rem] tracking-widest uppercase font-sans border-b p-0.5" style={{ color: g.color, borderColor: g.color }}>See top 10 →</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* EXTRAS */}
      <motion.div ref={refs.extras} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="bg-forest p-10 md:p-24 px-6 md:px-12 scroll-mt-[70px]">
        <p className="text-[0.68rem] tracking-[0.22em] uppercase text-birch mb-3 font-sans">Add to your stay</p>
        <h2 className="font-serif text-[2.4rem] font-light text-cream mb-3 leading-[1.15]">Everything you need,<br /><em className="italic">taken care of</em></h2>
        <div className="extras-grid grid grid-cols-1 md:grid-cols-3 gap-0.5 bg-birch/12 mt-8">
          {[{ t: "Car Rental", s: "A rental car ready for your arrival — ideal for day trips to the Finnish countryside.", l: "Enquire when booking →" }, { t: "Airport Transfer", s: "Private transfers from Helsinki-Vantaa airport on request.", l: "Enquire when booking →" }, { t: "Local Experiences", s: "Sauna evenings, archipelago boat trips, market tours, and seasonal events.", l: "Ask us anything →" }].map((e, idx) => (
            <motion.div key={e.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: idx * 0.1 }} whileHover={{ backgroundColor: "rgba(61,79,62,0.88)" }} className="bg-forest/55 p-9 cursor-pointer border border-birch/12 transition-colors duration-250">
              <div className="w-9 h-9 border border-birch/28 flex items-center justify-center mb-4.5 text-birch">◇</div>
              <p className="font-serif text-[1.35rem] font-light text-cream mb-2">{e.t}</p>
              <p className="text-[0.78rem] text-birch leading-loose font-light mb-4">{e.s}</p>
              <span className="text-[0.63rem] tracking-widest uppercase text-birch border-b border-birch/35 pb-0.5 font-sans">{e.l}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* REVIEWS */}
      <motion.div ref={refs.reviews} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} className="sec-pad p-10 md:p-24 px-6 md:px-12 scroll-mt-[70px]">
        <p className="text-[0.68rem] tracking-[0.22em] uppercase text-clay mb-3 font-sans">Guest reviews</p>
        <h2 className="font-serif text-[2.2rem] md:text-[2.8rem] font-light mb-12 leading-[1.15]">What our guests <em className="italic">say</em></h2>
        <div className="bg-cream p-10 md:p-20 relative overflow-hidden">
          <div className="absolute top-10 left-10 text-[8rem] font-serif text-mist leading-none select-none">"</div>
          <AnimatePresence mode="wait">
            <motion.div key={reviewIdx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }} className="relative z-10 text-center max-w-[800px] mx-auto">
              <p className="font-serif text-[1.6rem] md:text-[2.2rem] font-light italic leading-relaxed mb-10 text-charcoal">{REVIEWS[reviewIdx].text}</p>
              <div className="flex flex-col items-center">
                <div className="font-serif text-xl font-light mb-1">{REVIEWS[reviewIdx].flag} {REVIEWS[reviewIdx].name}</div>
                <div className="text-[0.65rem] tracking-widest uppercase text-clay font-sans mb-3">{REVIEWS[reviewIdx].listing}</div>
                <div className="text-[0.8rem] text-clay">{"★".repeat(REVIEWS[reviewIdx].rating)}</div>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="flex justify-center gap-4 mt-12">
            <button onClick={() => setReviewIdx(p => (p - 1 + REVIEWS.length) % REVIEWS.length)} className="bg-transparent border border-mist text-charcoal p-2 px-4 font-sans text-xs tracking-widest uppercase cursor-pointer hover:bg-mist transition-colors">Prev</button>
            <button onClick={() => setReviewIdx(p => (p + 1) % REVIEWS.length)} className="bg-forest text-white border-none p-2 px-4 font-sans text-xs tracking-widest uppercase cursor-pointer hover:bg-forest/90 transition-colors">Next</button>
          </div>
        </div>
      </motion.div>

      {/* ABOUT */}
      <motion.div ref={refs.about} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }} className="about-grid grid grid-cols-1 lg:grid-cols-2 min-h-[60vh] scroll-mt-[70px]">
        <div className="anna-img bg-mist flex items-center justify-center relative min-h-[400px]">
          <span className="font-serif text-[6rem] md:text-[9rem] font-light text-birch italic select-none">A.</span>
          <span className="absolute bottom-6 left-6 text-[0.63rem] tracking-widest uppercase text-muted border border-mist bg-warm-white p-1 px-3 font-sans">Photo coming soon</span>
        </div>
        <div className="bg-warm-white flex flex-col justify-center p-10 md:p-20 px-6 md:px-12">
          <p className="text-[0.68rem] tracking-[0.22em] uppercase text-clay mb-3 font-sans">A personal note</p>
          <blockquote className="font-serif text-[1.4rem] md:text-[1.7rem] font-light italic leading-relaxed mb-7 border-l-2 border-clay pl-7">
            "We want every guest to feel like they've borrowed a friend's home — not rented a property."
          </blockquote>
          <p className="text-[0.88rem] text-muted leading-loose font-light mb-7">We're Anna and her partner — two design-minded Helsinkians who fell in love with the idea of sharing the city we call home. Each apartment reflects our personal taste: clean lines, warm materials, and nothing superfluous.</p>
          <p className="font-serif text-lg text-clay">— Anna &amp; partner, your hosts</p>
          <div className="flex gap-2 mt-5 flex-wrap">
            {["Superhost", "Within 1 hour", "Self-managed", "Helsinki locals"].map(b => (
              <span key={b} className="text-[0.62rem] tracking-widest uppercase border border-mist text-muted p-1 px-3.5 font-sans">{b}</span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* FAQ */}
      <motion.div ref={refs.faq} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }} className="sec-pad bg-cream p-10 md:p-24 px-6 md:px-12 scroll-mt-[70px]">
        <p className="text-[0.68rem] tracking-[0.22em] uppercase text-clay mb-3 font-sans">FAQ</p>
        <h2 className="font-serif text-[2.2rem] md:text-[2.8rem] font-light mb-12 leading-[1.15]">Frequently asked <em className="italic">questions</em></h2>
        <div className="max-w-[700px] flex flex-col gap-0.5 bg-mist">
          {FAQS.map((f, i) => (
            <div key={i} className="bg-warm-white overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full bg-none border-none p-5 px-6 cursor-pointer flex justify-between items-center text-left gap-3">
                <span className="font-serif text-lg font-light text-charcoal">{f.q}</span>
                <span className={`text-clay text-lg shrink-0 transition-transform duration-200 ${openFaq === i ? "rotate-45" : ""}`}>+</span>
              </button>
              <AnimatePresence>
                {openFaq === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-6 pt-0 text-[0.85rem] text-muted leading-loose font-light">{f.a}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </motion.div>

      {/* CONTACT */}
      <motion.div ref={refs.contact} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }} className="sec-pad p-10 md:p-24 px-6 md:px-12 scroll-mt-[70px]">
        <div className="contact-grid grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div>
            <p className="text-[0.68rem] tracking-[0.22em] uppercase text-clay mb-3 font-sans">Get in touch</p>
            <h2 className="font-serif text-[2.2rem] md:text-[2.8rem] font-light leading-[1.2]">Ready to book<br />your stay in<br /><em className="text-clay italic">Helsinki?</em></h2>
            <p className="text-[0.86rem] text-muted leading-loose mt-5 font-light">Send us a message and we'll get back to you within the hour.</p>
            <div className="mt-8 flex flex-col gap-2.5">
              <a href="mailto:info@anna-stays.fi" className="flex items-center gap-2.5 text-[0.85rem] text-charcoal no-underline font-sans">
                <span className="w-8 h-8 bg-cream flex items-center justify-center text-sm"><Mail size={14} /></span>
                info@anna-stays.fi
              </a>
              <a href="https://wa.me/358442400228" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-[0.85rem] text-charcoal no-underline font-sans">
                <span className="w-8 h-8 bg-[#25D366] flex items-center justify-center text-sm text-white"><Phone size={14} /></span>
                WhatsApp: +358 44 240 0228
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[0.63rem] tracking-widest uppercase text-muted font-sans">First name</label>
                <input
                  placeholder="Anna"
                  value={contactForm.firstName}
                  onChange={e => setContactForm(f => ({ ...f, firstName: e.target.value }))}
                  className="bg-cream border border-mist p-3 px-4 font-sans text-sm text-charcoal font-light outline-none w-full focus:border-clay transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[0.63rem] tracking-widest uppercase text-muted font-sans">Last name</label>
                <input
                  placeholder="Smith"
                  value={contactForm.lastName}
                  onChange={e => setContactForm(f => ({ ...f, lastName: e.target.value }))}
                  className="bg-cream border border-mist p-3 px-4 font-sans text-sm text-charcoal font-light outline-none w-full focus:border-clay transition-colors"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.63rem] tracking-widest uppercase text-muted font-sans">Email</label>
              <input
                type="email"
                placeholder="your@email.com"
                value={contactForm.email}
                onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                className="bg-cream border border-mist p-3 px-4 font-sans text-sm text-charcoal font-light outline-none w-full focus:border-clay transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.63rem] tracking-widest uppercase text-muted font-sans">Which apartment?</label>
              <select
                value={contactForm.apartment}
                onChange={e => setContactForm(f => ({ ...f, apartment: e.target.value }))}
                className="bg-cream border border-mist p-3 px-4 font-sans text-sm text-charcoal font-light outline-none appearance-none cursor-pointer focus:border-clay transition-colors"
              >
                <option value="">Not sure yet</option>
                {listings?.map(l => <option key={l.id} value={l.name}>{l.name} — {l.neigh}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[0.63rem] tracking-widest uppercase text-muted font-sans">Check-in</label>
                <input
                  type="date"
                  value={contactForm.checkIn}
                  onChange={e => setContactForm(f => ({ ...f, checkIn: e.target.value }))}
                  className="bg-cream border border-mist p-3 px-4 font-sans text-sm text-charcoal font-light outline-none w-full focus:border-clay transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[0.63rem] tracking-widest uppercase text-muted font-sans">Check-out</label>
                <input
                  type="date"
                  value={contactForm.checkOut}
                  onChange={e => setContactForm(f => ({ ...f, checkOut: e.target.value }))}
                  className="bg-cream border border-mist p-3 px-4 font-sans text-sm text-charcoal font-light outline-none w-full focus:border-clay transition-colors"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.63rem] tracking-widest uppercase text-muted font-sans">Message (optional)</label>
              <textarea
                rows={3}
                placeholder="Any questions or special requests..."
                value={contactForm.message}
                onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                className="bg-cream border border-mist p-3 px-4 font-sans text-sm text-charcoal font-light outline-none resize-y focus:border-clay transition-colors"
              />
            </div>
            {contactError && (
              <p className="text-clay text-[0.7rem] font-sans italic">{contactError}</p>
            )}
            {contactSent ? (
              <div className="p-4 bg-forest/10 border border-forest/20 text-forest text-[0.75rem] flex items-center gap-2">
                <Check size={14} /> Thank you! We'll be in touch within the hour.
              </div>
            ) : (
              <button
                onClick={handleContactSubmit}
                disabled={contactSubmitting}
                className="bg-forest text-white border-none p-3.5 px-8 font-sans text-xs tracking-widest uppercase cursor-pointer self-start hover:bg-forest/90 transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {contactSubmitting
                  ? <><RefreshCw size={12} className="animate-spin" /> Sending...</>
                  : "Send enquiry →"}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* FOOTER */}
      <motion.footer initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1 }} className="footer-grid bg-charcoal p-10 md:p-12 grid grid-cols-1 md:grid-cols-3 items-center gap-10 md:gap-6">
        <div className="font-serif text-[1.35rem] font-light text-cream text-center md:text-left">Anna's <em className="text-birch italic">Stays</em></div>
        <div className="flex gap-4 justify-center flex-wrap">
          {[["stays", "Stays"], ["guide", "Guide"], ["extras", "Extras"], ["reviews", "Reviews"], ["faq", "FAQ"], ["contact", "Contact"]].map(([id, l]) => (
            <button key={id} onClick={() => scrollTo(id)} className="bg-none border-none cursor-pointer text-[0.66rem] tracking-widest uppercase text-muted font-sans hover:text-cream transition-colors">{l}</button>
          ))}
        </div>
        <div className="text-center md:text-right">
          <span className="text-[0.78rem] text-birch block mb-1">info@anna-stays.fi</span>
          <span className="text-[0.63rem] text-muted">© 2026 Anna's Stays · Helsinki, Finland</span>
        </div>
      </motion.footer>

      {/* WHATSAPP FLOAT */}
      <a href="https://wa.me/358442400228" target="_blank" rel="noopener noreferrer" className="fixed bottom-7 right-7 bg-[#25D366] text-white w-[52px] h-[52px] rounded-full flex items-center justify-center text-2xl z-[998] shadow-[0_2px_12px_rgba(0,0,0,0.2)] no-underline">
        <Phone size={24} />
      </a>

      {booking && <BookingModal listing={booking} onClose={() => setBooking(null)} />}
      {guideModal && <GuideModal category={guideModal} onClose={() => setGuideModal(null)} />}
      {showEvents && <EventsPage onClose={() => setShowEvents(false)} />}
      {lightbox && <Lightbox imgs={lightbox.imgs} startIdx={lightbox.idx} onClose={() => setLightbox(null)} />}
      <ChatBot listings={listings} onBookNow={(id) => {
        try {
          const apt = listings.find(l => String(l.id) === String(id));
          if (apt) setBooking(apt);
          else console.error("App: Could not find apartment for ID:", id);
        } catch (err) {
          console.error("App: Error in onBookNow handler:", err);
        }
      }} />
    </div>
    </div>
    <div className="lg:hidden">
      <MobileApp listings={listings} specialPrices={specialPrices} isAdmin={isAdmin} />
    </div>
    </>
  );
}

function MobileApp({ listings, specialPrices, isAdmin }: { listings: any[], specialPrices: any[], isAdmin: boolean }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'stays' | 'helsinki' | 'chat'>('stays');
  const [booking, setBooking] = useState<any | null>(null);
  const [guideModal, setGuideModal] = useState<any | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [lightbox, setLightbox] = useState<{ imgs: string[]; idx: number } | null>(null);

  const getMobilePrice = (listing: any) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const aptPrices = specialPrices.filter(p => p.apartment_id === listing.id);
    const event = aptPrices.find(p => p.pricing_type !== 'season' && todayStr >= p.start_date && todayStr <= p.end_date);
    if (event) return event.price_override || event.price;
    const highSeason = aptPrices.find(p => p.pricing_type === 'season' && p.event_name?.toLowerCase().includes('high') && todayStr >= p.start_date && todayStr <= p.end_date);
    if (highSeason) {
      const day = today.getDay();
      const isWeekend = day === 5 || day === 6;
      return isWeekend ? (highSeason.weekend_price_override || highSeason.price_override) : highSeason.price_override;
    }
    const day = today.getDay();
    const isWeekend = day === 5 || day === 6;
    if (isWeekend && listing.weekend_pricing_enabled) {
      const base = listing.price;
      const val = listing.weekend_pricing_value || 0;
      return listing.weekend_pricing_type === 'percentage' ? Math.round(base * (1 + val / 100)) : base + val;
    }
    return listing.price;
  };

  return (
    <div className="flex flex-col h-dvh bg-warm-white overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-mist bg-white shrink-0">
        <span className="font-serif text-xl font-light">Anna's <em className="text-clay italic">Stays</em></span>
        <div className="flex items-center gap-3">
          <Link to="/find-booking" className="text-[0.6rem] uppercase tracking-widest font-bold font-sans text-muted no-underline">Find Booking</Link>
          {isAdmin && (
            <button onClick={() => navigate('/admin')} className="bg-none border-none p-0 cursor-pointer text-muted">
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'stays' && (
            <motion.div key="stays" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full overflow-y-auto">
              <div className="px-5 pt-6 pb-2">
                <p className="text-[0.62rem] tracking-[0.22em] uppercase text-clay mb-1 font-sans">Helsinki Apartments</p>
                <h2 className="font-serif text-2xl font-light">Choose your stay</h2>
              </div>
              <div className="flex flex-col pb-8">
                {listings.map((l, idx) => (
                  <div key={l.id}>
                    <div className="px-5 py-4">
                      <div className="relative h-[220px] bg-mist cursor-pointer overflow-hidden" onClick={() => setLightbox({ imgs: l.imgs, idx: 0 })}>
                        <img src={resolveImageUrl(l.imgs[0])} alt={l.name} className="w-full h-full object-cover" />
                        <span className="absolute top-3 left-3 text-[0.58rem] tracking-widest uppercase bg-white text-charcoal px-2 py-1 font-sans">
                          {(() => {
                            const ratingNum = typeof l.rating === 'string' ? parseFloat(l.rating.replace(/[^\d.]/g, '')) : Number(l.rating);
                            return `${ratingNum >= 4.8 ? 'Superhost · ' : ''}★ ${l.rating || '5.0'}`;
                          })()}
                        </span>
                      </div>
                      <div className="mt-3">
                        <p className="text-[0.6rem] tracking-widest uppercase text-clay font-sans">{l.neigh}</p>
                        <h3 className="font-serif text-xl font-light mt-0.5 mb-1">{l.name}</h3>
                        <div className="flex gap-1 flex-wrap mb-2">
                          {l.tags?.slice(0, 4).map((t: string) => (
                            <span key={t} className="text-[0.55rem] tracking-widest uppercase border border-mist text-muted px-2 py-0.5 font-sans">{t}</span>
                          ))}
                        </div>
                        <div className="flex items-end justify-between mt-3">
                          <div>
                            <span className="font-serif text-2xl font-light">€{getMobilePrice(l)}</span>
                            <span className="text-[0.65rem] text-muted font-sans ml-1">/ night</span>
                          </div>
                          <span className="text-[0.62rem] text-muted font-sans">{l.size} · {l.guests} guests</span>
                        </div>
                        <button
                          onClick={() => setBooking(l)}
                          className="mt-3 w-full bg-forest text-white font-sans text-[0.68rem] tracking-widest uppercase py-3 border-none cursor-pointer"
                        >
                          {l.is_instant_book !== false ? 'Book Now' : 'Request to Stay'}
                        </button>
                      </div>
                    </div>
                    {idx < listings.length - 1 && (
                      <div className="flex items-center justify-center gap-2 py-1 text-mist">
                        <span>◇</span><span>◇</span><span>◇</span>
                      </div>
                    )}
                  </div>
                ))}
                <div className="mx-5 mt-4 p-5 bg-cream text-center">
                  <p className="font-serif text-lg font-light mb-1">Not sure which apartment?</p>
                  <p className="text-[0.75rem] text-muted font-sans mb-3">Chat with Anna and she'll help you find the perfect fit.</p>
                  <button onClick={() => setActiveTab('chat')} className="bg-charcoal text-white font-sans text-[0.65rem] tracking-widest uppercase px-6 py-2.5 border-none cursor-pointer">
                    Chat with Anna
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'helsinki' && (
            <motion.div key="helsinki" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full overflow-y-auto">
              <div className="px-5 pt-6 pb-4">
                <p className="text-[0.62rem] tracking-[0.22em] uppercase text-clay mb-1 font-sans">Local Knowledge</p>
                <h2 className="font-serif text-2xl font-light mb-4">Helsinki Guide</h2>
                <button onClick={() => setShowEvents(true)} className="w-full flex items-center justify-between bg-forest text-white px-5 py-4 border-none cursor-pointer">
                  <span className="flex items-center gap-2 font-sans text-[0.7rem] tracking-widest uppercase"><CalendarDays size={14} /> This Week in Helsinki</span>
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="mx-5 mb-4 grid grid-cols-2 gap-0.5 bg-mist">
                {GUIDE_DATA.map((g) => (
                  <div key={g.title} onClick={() => setGuideModal(g)} className="bg-white p-4 cursor-pointer active:bg-cream transition-colors">
                    <div className="text-base mb-2" style={{ color: g.color }}>{g.icon}</div>
                    <p className="font-serif text-sm font-light mb-0.5">{g.title}</p>
                    <p className="text-[0.6rem] text-muted font-sans">{g.places[0].name} & more</p>
                  </div>
                ))}
              </div>
              <div className="mx-5 mb-8 flex flex-col gap-3">
                <a href="mailto:info@anna-stays.fi" className="flex items-center gap-2.5 text-[0.82rem] text-charcoal no-underline font-sans">
                  <span className="w-7 h-7 bg-cream flex items-center justify-center"><Mail size={13} /></span>
                  info@anna-stays.fi
                </a>
                <a href="https://wa.me/358442400228" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-[0.82rem] text-charcoal no-underline font-sans">
                  <span className="w-7 h-7 bg-[#25D366] flex items-center justify-center text-white"><Phone size={13} /></span>
                  WhatsApp: +358 44 240 0228
                </a>
              </div>
            </motion.div>
          )}

          {activeTab === 'chat' && (
            <motion.div key="chat" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full flex flex-col">
              <ChatBot listings={listings} onBookNow={(id) => {
                const apt = listings.find(l => String(l.id) === String(id));
                if (apt) { setBooking(apt); setActiveTab('stays'); }
              }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="shrink-0 bg-white border-t border-mist grid grid-cols-3">
        {([
          { id: 'stays' as const, icon: <Home size={20} />, label: 'Stays' },
          { id: 'helsinki' as const, icon: <Map size={20} />, label: 'Helsinki' },
          { id: 'chat' as const, icon: <MessageCircle size={20} />, label: 'Chat' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center gap-1 py-3 border-none bg-none cursor-pointer transition-colors ${activeTab === tab.id ? 'text-clay' : 'text-muted'}`}
          >
            {tab.icon}
            <span className="text-[0.55rem] uppercase tracking-widest font-bold font-sans">{tab.label}</span>
            {activeTab === tab.id && <span className="w-1 h-1 rounded-full bg-clay" />}
          </button>
        ))}
      </div>

      {booking && <BookingModal listing={booking} onClose={() => setBooking(null)} />}
      {guideModal && <GuideModal category={guideModal} onClose={() => setGuideModal(null)} />}
      {showEvents && <EventsPage onClose={() => setShowEvents(false)} />}
      {lightbox && <Lightbox imgs={lightbox.imgs} startIdx={lightbox.idx} onClose={() => setLightbox(null)} />}
    </div>
  );
}
