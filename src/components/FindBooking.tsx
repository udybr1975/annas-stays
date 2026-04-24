import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Search, ArrowLeft, RefreshCw, AlertCircle, Mail, Hash } from "lucide-react";

export default function FindBooking() {
  const [bookingId, setBookingId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Clean the booking ID (remove RES- prefix if guest typed it)
      const cleanRef = bookingId.trim().toUpperCase();
      const refToSearch = cleanRef.startsWith("RES-") ? cleanRef : `RES-${cleanRef}`;

      // STEP 1: Find the booking by reference number
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('id, guest_id, status')
        .eq('reference_number', refToSearch)
        .single();

      if (bookingError || !bookingData) {
        throw new Error("We couldn't find a reservation with that reference number.");
      }

      // Task 2: Deny access if cancelled or declined
      if (bookingData.status === 'cancelled' || bookingData.status === 'declined') {
        throw new Error("This reservation is no longer accessible.");
      }

      // STEP 2: Verify the guest email matches the guest_id
      const { data: guestData, error: guestError } = await supabase
        .from('guests')
        .select('email')
        .eq('id', bookingData.guest_id)
        .eq('email', email.trim().toLowerCase())
        .single();

      if (guestError || !guestData) {
        throw new Error("The email address provided does not match the one used for this reservation.");
      }

      // Store a temporary "session" in localStorage to bypass verification on the manage page
      localStorage.setItem(`booking_auth_${bookingData.id}`, email.trim().toLowerCase());
      
      // Redirect to the management page with email for "Fast Pass" verification
      navigate(`/manage-booking/${bookingData.id}?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (err: any) {
      console.error("Search error:", err);
      setError(err.message || "An error occurred during search.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <Link to="/" className="inline-flex items-center gap-2 text-muted hover:text-charcoal transition-colors mb-8 no-underline text-[0.65rem] uppercase tracking-[0.2em] font-sans">
          <ArrowLeft size={14} /> Back to Anna's Stays
        </Link>

        <div className="bg-white p-10 border border-mist shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-clay" />
          
          <div className="text-center mb-10">
            <h1 className="font-serif text-3xl mb-3 font-light">Find Your Booking</h1>
            <p className="text-muted text-sm leading-relaxed italic">Enter your details to manage your stay in Helsinki.</p>
          </div>

          <form onSubmit={handleSearch} className="space-y-6">
            <div>
              <label className="block text-[0.65rem] uppercase tracking-widest text-muted font-sans font-bold mb-2">
                Booking Reference
              </label>
              <div className="relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-clay/50" size={16} />
                <input
                  type="text"
                  required
                  placeholder="e.g. RES-A1B2"
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                  className="w-full bg-cream/30 border border-mist p-4 pl-12 font-mono text-sm focus:outline-none focus:border-clay transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[0.65rem] uppercase tracking-widest text-muted font-sans font-bold mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-clay/50" size={16} />
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-cream/30 border border-mist p-4 pl-12 font-sans text-sm focus:outline-none focus:border-clay transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-clay/5 border border-clay/10 flex items-start gap-3 text-clay text-xs italic">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-charcoal text-white p-5 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-charcoal/90 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg"
            >
              {loading ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />}
              Search Reservation
            </button>
          </form>

          <div className="mt-10 pt-8 border-t border-mist text-center">
            <p className="text-[0.65rem] text-muted font-sans italic">
              Can't find your reference? Check your confirmation email or contact Anna at <a href="mailto:anna.humalainen@gmail.com" className="text-clay no-underline">anna.humalainen@gmail.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
