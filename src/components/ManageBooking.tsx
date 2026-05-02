import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../lib/supabase";
import { LISTINGS } from "../constants";
import { RefreshCw, AlertCircle, CheckCircle, ArrowLeft, Trash2, Mail, Phone, Lock, ChevronRight, Send, Check } from "lucide-react";
import { format } from "date-fns";
import BookingEmailTemplate from "./BookingEmailTemplate";
import ChatBot from "./ChatBot";

export default function ManageBooking({ listings = [] }: { listings?: any[] }) {
  const VITE_GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  if (VITE_GEMINI_API_KEY) {
    (window as any).GEMINI_API_KEY = VITE_GEMINI_API_KEY;
  }

  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [booking, setBooking] = useState<any>(null);
  const [listing, setListing] = useState<any>(null);
  const [guest, setGuest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showCancelSuccessModal, setShowCancelSuccessModal] = useState(false);
  const [refundIssued, setRefundIssued] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replySent, setReplySent] = useState(false);

  const [isVerified, setIsVerified] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const fastPassEmail = searchParams.get("email");
      if (fastPassEmail) setVerifyEmail(fastPassEmail);
      checkAuth();
    }
  }, [id]);

  const checkAuth = async () => {
    setLoading(true);
    const fastPassEmail = searchParams.get("email");
    const sessionEmail = localStorage.getItem(`booking_auth_${id}`);
    const emailToVerify = (fastPassEmail || sessionEmail)?.toLowerCase().trim();

    try {
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('apartment_id, apartments(name)')
        .eq('id', id)
        .single();
      if (bookingData) {
        const allListings = listings.length > 0 ? listings : LISTINGS;
        const apt = allListings.find(l => String(l.id) === String(bookingData.apartment_id));
        if (apt) setListing(apt);
      }
    } catch (e) {}

    if (emailToVerify) {
      const verified = await performVerification(emailToVerify);
      if (verified) {
        setIsVerified(true);
        localStorage.setItem(`booking_auth_${id}`, emailToVerify);
        setLoading(false);
        return;
      }
    }
    setLoading(false);
  };

  const performVerification = async (email: string) => {
    try {
      const { data: bookingData, error: bError } = await supabase
        .from('bookings')
        .select('id, guest_id, apartment_id, apartments(name)')
        .eq('id', id)
        .single();
      if (bError || !bookingData) return false;

      const allListings = listings.length > 0 ? listings : LISTINGS;
      const apt = allListings.find(l => String(l.id) === String(bookingData.apartment_id));
      if (apt) setListing(apt);

      const { data: guestData, error: gError } = await supabase
        .from('guests')
        .select('email')
        .eq('id', bookingData.guest_id)
        .ilike('email', email.trim())
        .single();
      if (gError || !guestData) return false;

      await fetchBookingData();
      return true;
    } catch (err) {
      return false;
    }
  };

  const handleManualVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError(null);
    const verified = await performVerification(verifyEmail);
    if (verified) {
      setIsVerified(true);
      localStorage.setItem(`booking_auth_${id}`, verifyEmail.toLowerCase().trim());
    } else {
      try {
        const { data: bookingRef } = await supabase
          .from('bookings')
          .select('reference_number')
          .eq('id', id)
          .single();
        if (bookingRef) {
          setVerifyError(`This email does not match the one used for booking ${bookingRef.reference_number}`);
        } else {
          setVerifyError("Email address does not match this reservation.");
        }
      } catch (err) {
        setVerifyError("Email address does not match this reservation.");
      }
    }
  };

  const fetchBookingData = async () => {
    setError(null);
    try {
      const { data: bData, error: bErr } = await supabase
        .from('bookings')
        .select('*, guests(*), apartments(name)')
        .eq('id', id)
        .single();
      if (bErr) throw bErr;
      if (!bData) throw new Error("Booking not found");

      if (bData.status === 'cancelled' || bData.status === 'declined') {
        throw new Error("This reservation is no longer accessible.");
      }

      let guestData = bData.guests;
      if (!guestData && bData.guest_id) {
        const { data: gData, error: gErr } = await supabase
          .from('guests')
          .select('*')
          .eq('id', bData.guest_id)
          .single();
        if (!gErr) guestData = gData;
      }

      setBooking(bData);
      setGuest(guestData);

      const allListings = listings.length > 0 ? listings : LISTINGS;
      const localListing = allListings.find(l => String(l.id) === String(bData.apartment_id));
      if (localListing) {
        setListing(localListing);
      } else {
        const { data: dbListing } = await supabase.from('apartments').select('*').eq('id', bData.apartment_id).single();
        if (dbListing) setListing(dbListing);
      }
    } catch (err: any) {
      console.error("Error fetching booking:", err);
      setError(err.message || "Could not load booking details.");
    } finally {
      setLoading(false);
    }
  };

  const executeCancel = async () => {
    if (!booking?.id) return;
    setCancelling(true);
    try {
      const guestFirstName = guest?.first_name || guest?.name || 'Guest';

      const response = await fetch('/api/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          guestEmail: guest?.email || '',
          guestFirstName,
          apartmentName: listing?.name || '',
          referenceNumber: booking.reference_number,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Cancellation failed');
      }

      setRefundIssued(result.refundIssued === true);
      setShowConfirmCancel(false);
      setShowCancelSuccessModal(true);

      // Update local state directly — do not refetch (fetchBookingData throws on cancelled)
      setBooking((prev: any) => ({
        ...prev,
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      }));

    } catch (err: any) {
      console.error("Error cancelling booking:", err);
      alert("Cancellation failed: " + err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleReply = async () => {
    if (!booking || !replyMessage.trim()) return;
    setSendingReply(true);
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm");
    const newMessage = `[${timestamp}] Guest: ${replyMessage.trim()}`;
    const updatedNotes = booking.notes
      ? `${booking.notes}\n---\n${newMessage}`
      : newMessage;

    try {
      const { error: dbError } = await supabase
        .from('bookings')
        .update({
          notes: updatedNotes,
          last_message_at: new Date().toISOString(),
          admin_needs_attention: true,
          unread_message_count: (booking.unread_message_count || 0) + 1,
        })
        .eq('id', booking.id);
      if (dbError) throw dbError;

      const guestName = guest?.first_name
        ? `${guest.first_name} ${guest.last_name || ''}`.trim()
        : guest?.name || 'A guest';

      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New Guest Message",
          priority: "high",
          body: `New message from ${guestName} (${booking.reference_number}):\n"${replyMessage.trim()}"`,
        }),
      }).catch(err => console.error("ntfy error:", err));

      fetch("/api/send-email", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: "info@anna-stays.fi",
          replyTo: guest?.email || undefined,
          subject: "New Guest Message — #" + booking.reference_number + " | Anna's Stays",
          html:
            '<div style="font-family:Georgia,serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:32px;border:1px solid #E8E3DC;">' +
            '<h2 style="font-weight:normal;">New Message from Guest</h2>' +
            "<p><strong>Guest:</strong> " + guestName + "</p>" +
            "<p><strong>Reference:</strong> #" + booking.reference_number + "</p>" +
            "<p><strong>Apartment:</strong> " + (listing?.name || "") + "</p>" +
            "<p><strong>Check-in:</strong> " + booking.check_in + "</p>" +
            "<p><strong>Check-out:</strong> " + booking.check_out + "</p>" +
            '<div style="margin:24px 0;padding:16px 20px;background:#F7F4EF;border-left:4px solid #B09B89;">' +
            '<p style="white-space:pre-wrap;margin:0;">' + replyMessage.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</p>" +
            "</div>" +
            (guest?.email
              ? '<p style="font-size:0.8rem;color:#7A756E;">Reply directly to this email to respond to the guest.</p>'
              : "") +
            "</div>",
        }),
      }).catch(err => console.error("guest-message email error:", err));

      setReplySent(true);
      setReplyMessage("");
      setBooking({ ...booking, notes: updatedNotes });
      setTimeout(() => setReplySent(false), 5000);
    } catch (err: any) {
      alert("Failed to send message: " + err.message);
    } finally {
      setSendingReply(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin text-clay mx-auto mb-4" size={40} />
          <p className="font-serif text-xl">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isVerified) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-10 border border-mist shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-clay" />
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-clay/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="text-clay" size={24} />
            </div>
            <h1 className="font-serif text-2xl mb-2">Verify Your Identity</h1>
            <p className="text-muted text-sm leading-relaxed italic">For your security, please confirm the email address used for this reservation.</p>
          </div>
          <form onSubmit={handleManualVerify} className="space-y-6">
            <div>
              <label className="block text-[0.65rem] uppercase tracking-widest text-muted font-sans font-bold mb-2">Email Address</label>
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={verifyEmail}
                onChange={(e) => setVerifyEmail(e.target.value)}
                className="w-full bg-cream/30 border border-mist p-4 font-sans text-sm focus:outline-none focus:border-clay transition-colors"
              />
            </div>
            {verifyError && (
              <div className="p-4 bg-clay/5 border border-clay/10 flex items-start gap-3 text-clay text-xs italic">
                <AlertCircle size={16} className="shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}
            <button type="submit" className="w-full bg-charcoal text-white p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-charcoal/90 transition-all flex items-center justify-center gap-2 shadow-lg">
              Verify & Access <ChevronRight size={14} />
            </button>
          </form>
          <div className="mt-8 pt-6 border-t border-mist text-center">
            <Link to="/find-booking" className="text-[0.65rem] text-muted hover:text-clay transition-colors font-sans uppercase tracking-widest no-underline">
              Lost your link? Find booking by reference
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-warm-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-10 border border-mist shadow-xl text-center">
          <AlertCircle className="text-clay mx-auto mb-6" size={48} />
          <h1 className="font-serif text-3xl mb-4">Reservation Not Found</h1>
          <p className="text-muted mb-8 leading-relaxed">We couldn't find a booking with that ID. Please check your confirmation email or contact us for assistance.</p>
          <Link to="/" className="inline-block bg-charcoal text-white px-8 py-3 uppercase tracking-widest text-[0.7rem] no-underline">Return to Home</Link>
        </div>
      </div>
    );
  }

  const checkInDate = new Date(booking.check_in);
  const now = new Date();
  const diffHours = (checkInDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  const canCancel = diffHours > 48 && booking.status !== 'cancelled';
  const guestFirstName = guest?.first_name || guest?.name || 'Guest';

  return (
    <div className="min-h-screen bg-cream/30 py-12 px-4 md:px-10">
      <div className="max-w-[1000px] mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-muted hover:text-charcoal transition-colors mb-8 no-underline text-sm uppercase tracking-widest font-sans">
          <ArrowLeft size={16} /> Back to Anna's Stays
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10">
          {/* Left: Itinerary Preview */}
          <div className="order-2 lg:order-1">
            <h2 className="font-serif text-2xl mb-6 font-light">Your Reservation Details</h2>
            <div className="transform scale-[0.85] origin-top shadow-2xl">
              <BookingEmailTemplate booking={booking} listing={listing} guest={guest} isPrintView={true} />
            </div>
          </div>

          {/* Right: Management Actions */}
          <div className="order-1 lg:order-2">
            <div className="bg-white p-8 border border-mist shadow-lg sticky top-24">
              <h1 className="font-serif text-3xl mb-6 font-light">Manage Booking</h1>

              <div className="space-y-6">
                <div className="pb-6 border-b border-mist">
                  <p className="text-[0.65rem] uppercase tracking-widest text-muted font-sans mb-1">Status</p>
                  <div className="flex items-center gap-2">
                    {booking.status === 'cancelled' ? (
                      <span className="text-clay font-bold uppercase tracking-widest text-sm flex items-center gap-1.5">
                        <Trash2 size={14} /> Cancelled
                      </span>
                    ) : booking.status === 'pending' ? (
                      <span className="text-clay font-bold uppercase tracking-widest text-sm flex items-center gap-1.5">
                        <RefreshCw className="animate-spin" size={14} /> Pending Approval
                      </span>
                    ) : booking.status === 'awaiting_payment' ? (
                      <span className="text-amber-600 font-bold uppercase tracking-widest text-sm flex items-center gap-1.5">
                        <RefreshCw size={14} /> Awaiting Payment
                      </span>
                    ) : (
                      <span className="text-forest font-bold uppercase tracking-widest text-sm flex items-center gap-1.5">
                        <CheckCircle size={14} /> Confirmed
                      </span>
                    )}
                  </div>
                  {booking.cancelled_at && (
                    <p className="text-[0.65rem] text-muted mt-2 italic">Cancelled on {new Date(booking.cancelled_at).toLocaleDateString()}</p>
                  )}
                </div>

                {booking.status === 'confirmed' && (
                  <div>
                    <h3 className="text-[0.65rem] tracking-[0.2em] uppercase text-charcoal font-sans font-bold mb-3">Cancellation Policy</h3>
                    <div className="bg-cream/50 p-4 rounded-sm text-[0.75rem] text-muted leading-relaxed mb-6">
                      <p className="mb-2">Bookings can be cancelled up to 48 hours before check-in for a full refund.</p>
                      <p className="font-medium text-charcoal">Check-in: {new Date(booking.check_in).toLocaleString()}</p>
                      <p className="font-medium text-charcoal">Current time: {now.toLocaleString()}</p>
                    </div>

                    {canCancel ? (
                      <div className="space-y-3">
                        {!showConfirmCancel ? (
                          <button
                            onClick={() => setShowConfirmCancel(true)}
                            className="w-full bg-clay text-white p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-clay/90 transition-all flex items-center justify-center gap-2 shadow-md"
                          >
                            <Trash2 size={14} /> Cancel & Refund
                          </button>
                        ) : (
                          <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            <p className="text-[0.65rem] text-clay font-bold uppercase tracking-widest text-center mb-2">Are you absolutely sure?</p>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                onClick={executeCancel}
                                disabled={cancelling}
                                className="bg-clay text-white p-4 font-sans text-[0.65rem] tracking-[0.1em] uppercase hover:bg-clay/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                              >
                                {cancelling ? <RefreshCw className="animate-spin" size={12} /> : "Yes, Cancel"}
                              </button>
                              <button
                                onClick={() => setShowConfirmCancel(false)}
                                disabled={cancelling}
                                className="bg-charcoal text-white p-4 font-sans text-[0.65rem] tracking-[0.1em] uppercase hover:bg-charcoal/80 transition-all disabled:opacity-50 flex items-center justify-center shadow-md"
                              >
                                No, Keep It
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 bg-clay/10 border border-clay/20 text-clay text-[0.75rem] leading-relaxed italic">
                        Cancellation period has passed. Please contact Anna for assistance.
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-6 border-t border-mist">
                  <p className="text-[0.65rem] uppercase tracking-widest text-muted font-sans mb-4">Message Log</p>
                  <div className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-2">
                    {booking.notes ? (
                      booking.notes.split('---').map((msg: string, i: number) => (
                        <div key={i} className={`p-3 rounded-sm text-[0.7rem] leading-relaxed ${msg.includes('Host:') ? 'bg-forest/5 border-l-2 border-forest' : 'bg-clay/5 border-l-2 border-clay'}`}>
                          <p className="whitespace-pre-wrap">{msg.trim()}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[0.7rem] text-muted italic text-center py-4">No messages yet.</p>
                    )}
                  </div>
                  <div className="space-y-3">
                    <label className="block text-[0.6rem] uppercase tracking-widest text-muted font-bold">Reply to Host</label>
                    <div className="flex gap-2">
                      <textarea
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        className="flex-1 bg-cream/20 border border-mist p-3 text-xs min-h-[80px] outline-none focus:border-clay resize-none"
                        placeholder="Type your reply here..."
                      />
                      <button
                        onClick={handleReply}
                        disabled={!replyMessage.trim() || sendingReply}
                        className="bg-charcoal text-white px-4 py-2 text-[0.6rem] uppercase tracking-widest hover:bg-charcoal/90 disabled:opacity-50 h-[80px] flex flex-col items-center justify-center gap-1 min-w-[80px]"
                      >
                        {sendingReply ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                        <span>{sendingReply ? "Sending" : "Reply"}</span>
                      </button>
                    </div>
                    {replySent && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[0.6rem] text-forest font-bold uppercase tracking-widest flex items-center gap-1"
                      >
                        <Check size={10} /> Message Sent to Host
                      </motion.p>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-mist">
                  <p className="text-[0.65rem] uppercase tracking-widest text-muted font-sans mb-4">Need help?</p>
                  <div className="space-y-3">
                    <a href="mailto:hello@annasstays.fi" className="flex items-center gap-3 text-xs text-muted no-underline hover:text-charcoal transition-colors">
                      <Mail size={14} className="text-clay" /> hello@annasstays.fi
                    </a>
                    <a href="tel:+358442400228" className="flex items-center gap-3 text-xs text-muted no-underline hover:text-charcoal transition-colors">
                      <Phone size={14} className="text-clay" /> +358 44 2400 228
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ChatBot initialBooking={booking} initialListing={listing} listings={listings} />

      {/* Cancellation Success Modal */}
      <AnimatePresence>
        {showCancelSuccessModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm"
              onClick={() => navigate("/")}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white p-8 md:p-12 border border-mist shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-clay" />
              <div className="text-center">
                <div className="w-16 h-16 bg-clay/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="text-clay" size={32} />
                </div>
                <h2 className="font-serif text-2xl mb-4">Cancellation Confirmed</h2>
                <div className="bg-cream/50 p-6 border-l-4 border-clay mb-8 text-left italic font-serif leading-relaxed">
                  <p className="mb-4">Dear {guestFirstName},</p>
                  <p>This confirms that your reservation <strong className="not-italic">{booking?.reference_number}</strong> at <strong className="not-italic">{listing?.name}</strong> has been successfully cancelled.</p>
                  <p className="mt-4">
                    "I am so sorry to see your cancellation. I was really looking forward to hosting you in Helsinki! I completely understand that plans change, and I truly hope to have the chance to welcome you to one of my stays another time."
                  </p>
                  <div className="mt-6 not-italic">
                    <p className="font-cursive text-3xl text-clay mb-0.5">Anna Humalainen</p>
                    <p className="text-[0.6rem] tracking-[0.2em] uppercase text-muted font-sans">Host</p>
                  </div>
                </div>
                {refundIssued ? (
                  <p className="text-xs text-muted mb-8 font-sans leading-relaxed">
                    A full refund of <strong>EUR {booking?.total_price}</strong> has been issued to your original payment method and should appear within 5–10 business days.
                  </p>
                ) : (
                  <p className="text-xs text-muted mb-8 font-sans leading-relaxed">
                    If you paid for this booking, please contact us at hello@annasstays.fi and we will process your refund manually.
                  </p>
                )}
                <Link
                  to="/"
                  className="inline-block w-full bg-charcoal text-white p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-charcoal/90 transition-all shadow-lg no-underline"
                >
                  Return to Home
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
