import { useState, useEffect } from "react";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Apartments from "./components/Apartments";
import HelsinkiGuide from "./components/HelsinkiGuide";
import Extras from "./components/Extras";
import Reviews from "./components/Reviews";
import FAQ from "./components/FAQ";
import Footer from "./components/Footer";
import BookingModal from "./components/BookingModal";
import ChatBot from "./components/ChatBot"; 
import FindBooking from "./components/FindBooking";
import { LISTINGS } from "./constants";

export default function App() {
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFindBooking, setShowFindBooking] = useState(false);
  const [activeTab, setActiveTab] = useState("home");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "success") {
      // Use apartmentId from metadata sent to success_url
      const aptId = params.get("apartmentId");
      const bookedListing = LISTINGS.find(l => String(l.id) === aptId) || LISTINGS[0];
      
      setSelectedListing(bookedListing);
      setShowSuccess(true);
      
      // Clean URL parameters
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  const handleOpenBooking = (listing: any) => {
    setShowSuccess(false);
    setSelectedListing(listing);
  };

  return (
    <div className="relative min-h-screen bg-warm-white font-sans text-charcoal overflow-x-hidden">
      <Navbar 
        onFindBooking={() => setShowFindBooking(true)} 
        setActiveTab={setActiveTab}
        activeTab={activeTab}
      />
      
      <main>
        {showFindBooking ? (
          <FindBooking onBack={() => setShowFindBooking(false)} />
        ) : (
          <>
            <section id="home">
              <Hero onExplore={() => document.getElementById('apartments')?.scrollIntoView({ behavior: 'smooth' })} />
            </section>

            <section id="apartments" className="py-20 md:py-32">
              <div className="container mx-auto px-6">
                <div className="max-w-3xl mb-16">
                  <h2 className="font-serif text-5xl md:text-6xl font-light mb-6">Our Studios</h2>
                  <p className="text-muted text-lg font-light leading-relaxed">
                    Carefully curated spaces in the heart of Vantaa and Helsinki, designed for the modern traveler.
                  </p>
                </div>
                {/* Verified: Apartments component uses onBook prop */}
                <Apartments onBook={handleOpenBooking} />
              </div>
            </section>

            <section id="guide">
              <HelsinkiGuide />
            </section>

            <section id="extras">
              <Extras />
            </section>

            <section id="reviews">
              <Reviews />
            </section>

            <section id="faq">
              <FAQ />
            </section>
          </>
        )}
      </main>

      <Footer />
      <ChatBot />

      {selectedListing && (
        <BookingModal 
          listing={selectedListing} 
          onClose={() => {
            setSelectedListing(null);
            setShowSuccess(false);
          }} 
          initialStep={showSuccess ? 4 : 1}
        />
      )}
    </div>
  );
}
