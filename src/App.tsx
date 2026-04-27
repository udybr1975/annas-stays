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
import ChatWidget from "./components/ChatWidget";
import { LISTINGS } from "./constants";

export default function App() {
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Check if we are returning from a successful Stripe payment
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "success") {
      const sessionId = params.get("session_id");
      const apartmentId = params.get("apartmentId"); // Passed back in URL or found via session
      
      // Auto-open the modal on the success step
      // We find the listing that was just booked
      const bookedListing = LISTINGS.find(l => String(l.id) === apartmentId) || LISTINGS[0];
      
      setSelectedListing(bookedListing);
      setShowSuccess(true);
      
      // Clean the URL so refreshing doesn't keep the popup open
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  const handleOpenBooking = (listing: any) => {
    setShowSuccess(false);
    setSelectedListing(listing);
  };

  return (
    <div className="relative min-h-screen bg-warm-white font-sans text-charcoal overflow-x-hidden">
      {/* 1. Navigation & Header */}
      <Navbar />
      
      {/* 2. Main Page Content (The sections that disappeared) */}
      <main>
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
      </main>

      {/* 3. Footer */}
      <Footer />

      {/* 4. Global Widgets (Chat & Booking) */}
      <ChatWidget />

      {/* CRITICAL FIX: The Modal is rendered at the very end, 
          outside the <main> tag, ensuring it never truncates the layout.
      */}
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
