import { useState, useMemo, useRef } from "react";
import {
  format,
  addDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfDay,
  addMonths,
  subMonths,
  differenceInDays
} from "date-fns";
import {
  ChevronLeft, ChevronRight, User, Calendar, Clock, MapPin,
  Phone, Mail, Trash2, X, AlertCircle, Send, RefreshCw, Check,
  Sparkles, CreditCard, Bell, ChevronRight as ChevronRightIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../lib/supabase";

interface ExecutiveViewProps {
  bookings: any[];
  apartments: any[];
  specialPrices: any[];
  onCancelBooking: (id: string) => void;
  onUpdateBookingStatus?: (id: string, status: string) => void;
}

interface DrawerProps {
  selectedBooking: any;
  apartments: any[];
  guestMessage: string;
  setGuestMessage: (v: string) => void;
  sendingMessage: boolean;
  messageSent: boolean;
  acknowledging: boolean;
  onClose: () => void;
  onSendMessage: () => void;
  onAcknowledge: (id: string) => void;
  onConfirm: (c: ConfirmState) => void;
}

interface ConfirmState {
  type: 'accept' | 'decline' | 'cancel' | 'resend';
  bookingId: string;
  message: string;
}

interface ConfirmModalProps {
  confirmation: ConfirmState | null;
  onCancel: () => void;
  onConfirm: () => void;
}

const getGuestName = (booking: any) => {
  if (!booking) return "Unknown";
  const guestData = booking.guests;
  if (!guestData) return "Guest";
  const guest = Array.isArray(guestData) ? guestData[0] : guestData;
  if (!guest) return "Guest";
  const fullName = `${guest.first_name || ""} ${guest.last_name || ""}`.trim();
  return fullName || "Unnamed Guest";
};

const getStatusConfig = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'confirmed':        return { color: 'bg-forest',      text: 'text-forest',      label: 'Confirmed',        bar: 'bg-forest' };
    case 'pending':          return { color: 'bg-rose-400',    text: 'text-rose-500',    label: 'Pending',          bar: 'bg-rose-400' };
    case 'awaiting_payment': return { color: 'bg-amber-400',   text: 'text-amber-600',   label: 'Awaiting Payment', bar: 'bg-amber-400' };
    case 'cancelled':        return { color: 'bg-clay',        text: 'text-clay',        label: 'Cancelled',        bar: 'bg-clay' };
    case 'declined':         return { color: 'bg-muted',       text: 'text-muted',       label: 'Declined',         bar: 'bg-muted' };
    default:                 return { color: 'bg-charcoal',    text: 'text-charcoal',    label: status,             bar: 'bg-charcoal' };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BookingDrawer — standalone component so React never recreates it on re-render
// This is the fix for the mobile keyboard/focus bug
// ─────────────────────────────────────────────────────────────────────────────
function BookingDrawer({
  selectedBooking,
  apartments,
  guestMessage,
  setGuestMessage,
  sendingMessage,
  messageSent,
  acknowledging,
  onClose,
  onSendMessage,
  onAcknowledge,
  onConfirm,
}: DrawerProps) {
  if (!selectedBooking) return null;

  const apt = apartments.find((a: any) => a.id === selectedBooking.apartment_id);
  const guestData = selectedBooking.guests;
  const guest = Array.isArray(guestData) ? guestData[0] : guestData;
  const statusConfig = getStatusConfig(selectedBooking.status);

  return (
    <AnimatePresence>
      <>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-[4000]"
        />
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 220 }}
          className="fixed bottom-0 left-0 right-0 md:top-0 md:right-0 md:bottom-0 md:left-auto md:w-[420px] bg-warm-white shadow-2xl z-[4001] md:border-l border-t md:border-t-0 border-mist flex flex-col max-h-[92vh] md:max-h-full rounded-t-2xl md:rounded-none"
        >
          {/* Drag handle */}
          <div className="md:hidden flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-mist rounded-full" />
          </div>

          {/* Header */}
          <div className="px-5 py-4 border-b border-mist flex justify-between items-center bg-white">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${statusConfig.color}`} />
              <h3 className="font-serif text-lg">{getGuestName(selectedBooking)}</h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-mist rounded-full transition-colors">
              <X size={18} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Status + reference */}
            <div className="flex items-center justify-between">
              <span className={`text-[0.6rem] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full ${statusConfig.text} bg-current`}
                style={{ backgroundColor: 'currentColor' }}>
                <span className={`${statusConfig.text}`} style={{ background: 'none' }}>
                  {statusConfig.label}
                </span>
              </span>
              <span className="text-[0.6rem] font-mono text-muted">{selectedBooking.reference_number}</span>
            </div>

            {/* Awaiting payment expiry notice */}
            {selectedBooking.status === 'awaiting_payment' && selectedBooking.payment_link_expires_at && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-700 text-[0.68rem] flex items-center gap-2 rounded-sm">
                <Clock size={13} className="shrink-0" />
                Payment link expires: {new Date(selectedBooking.payment_link_expires_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            )}

            {/* Guest info */}
            <div className="bg-white border border-mist p-4 space-y-3">
              <p className="text-[0.58rem] uppercase tracking-widest text-muted font-bold">Guest</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-clay/10 rounded-full flex items-center justify-center">
                  <User size={16} className="text-clay" />
                </div>
                <div>
                  <p className="text-sm font-serif">{getGuestName(selectedBooking)}</p>
                  <p className="text-[0.6rem] text-muted">{guest?.email || selectedBooking.guests?.email}</p>
                </div>
              </div>
              {(guest?.phone || selectedBooking.guests?.phone) && (
                <div className="flex items-center gap-2 text-[0.68rem] text-muted pt-1 border-t border-mist/40">
                  <Phone size={12} className="text-clay" />
                  {guest?.phone || selectedBooking.guests?.phone}
                </div>
              )}
            </div>

            {/* Stay details */}
            <div className="bg-white border border-mist p-4 space-y-3">
              <p className="text-[0.58rem] uppercase tracking-widest text-muted font-bold">Stay</p>
              <div className="flex items-start gap-3">
                <MapPin size={14} className="text-clay mt-0.5 shrink-0" />
                <p className="text-sm font-serif">{apt?.name || "Unknown"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-mist/40">
                <div>
                  <p className="text-[0.58rem] uppercase tracking-widest text-muted font-bold mb-1">Check-in</p>
                  <p className="text-sm font-mono">{format(parseISO(selectedBooking.check_in), "d MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-[0.58rem] uppercase tracking-widest text-muted font-bold mb-1">Check-out</p>
                  <p className="text-sm font-mono">{format(parseISO(selectedBooking.check_out), "d MMM yyyy")}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-mist/40 flex items-center justify-between">
                <p className="text-[0.58rem] uppercase tracking-widest text-muted font-bold">Guests</p>
                <p className="text-sm">{selectedBooking.guest_count}</p>
              </div>
            </div>

            {/* Financials */}
            <div className={`${selectedBooking.status === 'pending' || selectedBooking.status === 'awaiting_payment' ? 'bg-clay' : 'bg-forest'} text-white p-4 rounded-sm`}>
              <p className="text-[0.58rem] uppercase tracking-widest opacity-60 mb-1">
                {selectedBooking.status === 'pending' ? 'Potential Earning' : selectedBooking.status === 'awaiting_payment' ? 'Awaiting Payment' : 'Total Paid'}
              </p>
              <p className="text-3xl font-serif">€{selectedBooking.total_price}</p>
            </div>

            {/* Notes */}
            {selectedBooking.notes && (
              <div className="bg-white border border-mist p-4 space-y-2">
                <p className="text-[0.58rem] uppercase tracking-widest text-muted font-bold">Notes & Messages</p>
                <div className="max-h-[180px] overflow-y-auto space-y-2 text-[0.7rem]">
                  {selectedBooking.notes.split('---').map((msg: string, i: number) => (
                    <div key={i} className={`p-2.5 rounded-sm ${msg.includes('Host:') ? 'bg-forest/5 border-l-2 border-forest' : 'bg-clay/5 border-l-2 border-clay'}`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.trim()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Send message — textarea is a direct DOM element, not a sub-component */}
            <div className="space-y-2">
              <p className="text-[0.58rem] uppercase tracking-widest text-muted font-bold">Send Message</p>
              <textarea
                value={guestMessage}
                onChange={(e) => setGuestMessage(e.target.value)}
                className="w-full bg-white border border-mist p-3 text-xs min-h-[100px] outline-none focus:border-clay resize-none rounded-sm"
                placeholder="Type your message to the guest..."
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                onClick={onSendMessage}
                disabled={!guestMessage.trim() || sendingMessage}
                className="w-full bg-charcoal text-white py-3 text-[0.65rem] uppercase tracking-widest hover:bg-charcoal/90 disabled:opacity-50 flex items-center justify-center gap-2 rounded-sm"
              >
                {sendingMessage ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                {sendingMessage ? "Sending..." : "Send Message"}
              </button>
              {messageSent && (
                <p className="text-[0.6rem] text-forest font-bold uppercase tracking-widest flex items-center gap-1">
                  <Check size={10} /> Sent successfully
                </p>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="p-4 border-t border-mist bg-white space-y-2.5">
            {selectedBooking.admin_needs_attention && (
              <button
                onClick={() => onAcknowledge(selectedBooking.id)}
                disabled={acknowledging}
                className="w-full bg-forest/10 text-forest border border-forest/20 py-3 font-sans text-[0.65rem] tracking-widest uppercase hover:bg-forest/20 transition-all flex items-center justify-center gap-2 rounded-sm"
              >
                {acknowledging ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                {acknowledging ? "Marking..." : "Mark as Read"}
              </button>
            )}

            {selectedBooking.status === 'pending' && (
              <>
                <button
                  onClick={() => onConfirm({ type: 'accept', bookingId: selectedBooking.id, message: "Approve this request? A 24-hour payment link will be sent to the guest by email." })}
                  className="w-full bg-forest text-white py-4 font-sans text-[0.7rem] tracking-[0.15em] uppercase hover:bg-forest/90 transition-all flex items-center justify-center gap-2 rounded-sm shadow-md"
                >
                  <Check size={15} /> Approve & Send Payment Link
                </button>
                <button
                  onClick={() => onConfirm({ type: 'decline', bookingId: selectedBooking.id, message: "Are you sure you want to decline this reservation request?" })}
                  className="w-full bg-white border border-clay text-clay py-3 font-sans text-[0.65rem] tracking-widest uppercase hover:bg-clay hover:text-white transition-all flex items-center justify-center gap-2 rounded-sm"
                >
                  <X size={13} /> Decline Request
                </button>
              </>
            )}

            {selectedBooking.status === 'awaiting_payment' && (
              <>
                <button
                  onClick={() => onConfirm({ type: 'resend', bookingId: selectedBooking.id, message: "Send a fresh 24-hour payment link to the guest?" })}
                  className="w-full bg-amber-500 text-white py-4 font-sans text-[0.7rem] tracking-[0.15em] uppercase hover:bg-amber-600 transition-all flex items-center justify-center gap-2 rounded-sm shadow-md"
                >
                  <CreditCard size={15} /> Resend Payment Link
                </button>
                <button
                  onClick={() => onConfirm({ type: 'cancel', bookingId: selectedBooking.id, message: "Cancel this reservation and release the dates?" })}
                  className="w-full bg-white border border-clay text-clay py-3 font-sans text-[0.65rem] tracking-widest uppercase hover:bg-clay hover:text-white transition-all flex items-center justify-center gap-2 rounded-sm"
                >
                  <Trash2 size={13} /> Cancel & Release Dates
                </button>
              </>
            )}

            {selectedBooking.status === 'confirmed' && (
              <button
                onClick={() => onConfirm({ type: 'cancel', bookingId: selectedBooking.id, message: "Are you sure you want to cancel this confirmed reservation?" })}
                className="w-full bg-white border border-clay text-clay py-3 font-sans text-[0.65rem] tracking-widest uppercase hover:bg-clay hover:text-white transition-all flex items-center justify-center gap-2 rounded-sm"
              >
                <Trash2 size={13} /> Cancel Reservation
              </button>
            )}
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmModal — standalone component for the same reason
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmModal({ confirmation, onCancel, onConfirm }: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {confirmation && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-charcoal/60 backdrop-blur-md z-[5000]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-sm bg-white shadow-2xl z-[5001] p-7 text-center rounded-sm"
          >
            <div className="w-14 h-14 bg-clay/10 rounded-full flex items-center justify-center text-clay mx-auto mb-5">
              <AlertCircle size={28} />
            </div>
            <h4 className="font-serif text-lg mb-3">Confirm Action</h4>
            <p className="text-sm text-muted mb-7 leading-relaxed">{confirmation.message}</p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 border border-mist text-[0.65rem] tracking-widest uppercase hover:bg-mist transition-colors rounded-sm"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 py-3 text-white text-[0.65rem] tracking-widest uppercase transition-all rounded-sm ${confirmation.type === 'accept' || confirmation.type === 'resend' ? 'bg-forest hover:bg-forest/90' : 'bg-clay hover:bg-clay/90'}`}
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActivityCard + EmptyState
// ─────────────────────────────────────────────────────────────────────────────
function ActivityCard({ booking, apartments, onClick }: { booking: any; apartments: any[]; onClick: () => void }) {
  const apt = apartments.find((a: any) => a.id === booking.apartment_id);
  return (
    <button onClick={onClick} className="w-full text-left bg-cream/20 border border-mist/50 p-4 hover:bg-white hover:shadow-md transition-all group">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-serif text-sm group-hover:text-clay transition-colors">{getGuestName(booking)}</h4>
        <span className="text-[0.5rem] font-mono text-muted">{booking.reference_number}</span>
      </div>
      <p className="text-[0.65rem] text-muted truncate mb-3 flex items-center gap-1.5"><MapPin size={10} /> {apt?.name || "Unknown"}</p>
      <div className="flex items-center justify-between pt-3 border-t border-mist/30">
        <div className="flex items-center gap-2 text-[0.6rem] text-muted">
          <Calendar size={10} />
          <span>{format(parseISO(booking.check_in), "MMM d")} - {format(parseISO(booking.check_out), "MMM d")}</span>
        </div>
        <span className="text-[0.6rem] font-bold">€{booking.total_price}</span>
      </div>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center border-2 border-dashed border-mist/50 rounded-sm">
      <p className="text-xs text-muted italic font-serif">{message}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function ExecutiveView({ bookings, apartments, specialPrices, onCancelBooking, onUpdateBookingStatus }: ExecutiveViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [guestMessage, setGuestMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [mobileFilter, setMobileFilter] = useState<'all' | 'pending' | 'awaiting_payment' | 'confirmed'>('all');
  const [confirmation, setConfirmation] = useState<ConfirmState | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const today = startOfDay(new Date());

  const handleAcknowledge = async (bookingId: string) => {
    setAcknowledging(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ admin_needs_attention: false, unread_message_count: 0 })
        .eq('id', bookingId);
      if (error) throw error;
      if (selectedBooking?.id === bookingId) {
        setSelectedBooking({ ...selectedBooking, admin_needs_attention: false, unread_message_count: 0 });
      }
    } catch (error) {
      console.error("Error acknowledging booking:", error);
    } finally {
      setAcknowledging(false);
    }
  };

  const handleConfirmAction = () => {
    if (!confirmation) return;
    if (confirmation.type === 'accept') onUpdateBookingStatus?.(confirmation.bookingId, 'confirmed');
    else if (confirmation.type === 'decline') onUpdateBookingStatus?.(confirmation.bookingId, 'declined');
    else if (confirmation.type === 'cancel') onCancelBooking(confirmation.bookingId);
    else if (confirmation.type === 'resend') onUpdateBookingStatus?.(confirmation.bookingId, 'resend_payment_link');
    setConfirmation(null);
    setSelectedBooking(null);
    setGuestMessage("");
    setMessageSent(false);
  };

  const handleSendMessage = async () => {
    if (!selectedBooking || !guestMessage.trim()) return;
    setSendingMessage(true);
    const apt = apartments.find((a: any) => a.id === selectedBooking.apartment_id);
    const guestData = selectedBooking.guests;
    const guest = Array.isArray(guestData) ? guestData[0] : guestData;
    const guestEmail = guest?.email;
    if (!guestEmail) { alert("Guest email not found."); setSendingMessage(false); return; }
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm");
    const newMessage = `[${timestamp}] Host: ${guestMessage.trim()}`;
    const updatedNotes = selectedBooking.notes ? `${selectedBooking.notes}\n---\n${newMessage}` : newMessage;
    try {
      const { error: dbError } = await supabase
        .from('bookings')
        .update({ notes: updatedNotes, last_message_at: new Date().toISOString(), admin_needs_attention: false, unread_message_count: 0 })
        .eq('id', selectedBooking.id);
      if (dbError) throw dbError;
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: guestEmail,
          subject: `Message from Anna's Stays — ${apt?.name || "your upcoming stay"}`,
          html: `<div style="font-family:sans-serif;color:#2C2C2A;max-width:600px;margin:0 auto;padding:20px;border:1px solid #E8E3DC;"><p>${guestMessage.replace(/\n/g, '<br>')}</p><p style="margin-top:30px;">Best regards,<br><strong>Anna's Stays</strong></p></div>`
        })
      });
      if (response.ok) {
        setMessageSent(true);
        setGuestMessage("");
        setSelectedBooking({ ...selectedBooking, notes: updatedNotes, admin_needs_attention: false, unread_message_count: 0 });
        setTimeout(() => setMessageSent(false), 5000);
      } else {
        alert("Failed to send email, but message was saved.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("An error occurred while sending the message.");
    } finally {
      setSendingMessage(false);
    }
  };

  const getPriceForDate = (apt: any, date: Date) => {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const special = specialPrices.find(p => {
      if (String(p.apartment_id) !== String(apt.id) || p.pricing_type === 'season') return false;
      const s = new Date(p.start_date || p.date); s.setHours(0, 0, 0, 0);
      const e = new Date(p.end_date || p.date); e.setHours(0, 0, 0, 0);
      return d >= s && d <= e;
    });
    if (special) return { price: special.price_override || special.price, type: special.event_name || "Special" };
    const season = specialPrices.find(p => {
      if (String(p.apartment_id) !== String(apt.id) || p.pricing_type !== 'season') return false;
      const s = new Date(p.start_date); s.setHours(0, 0, 0, 0);
      const e = new Date(p.end_date); e.setHours(0, 0, 0, 0);
      return d >= s && d <= e;
    });
    if (season) {
      const isWeekend = d.getDay() === 5 || d.getDay() === 6;
      return { price: isWeekend ? (season.weekend_price_override || season.price_override) : season.price_override, type: null };
    }
    return { price: apt.price_per_night || apt.price, type: null };
  };

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }), [currentMonth]);

  const todayActivity = useMemo(() => {
    const active = bookings.filter(b => b.status !== 'cancelled' && b.status !== 'declined');
    return {
      arriving: active.filter(b => isSameDay(parseISO(b.check_in), today)),
      departing: active.filter(b => isSameDay(parseISO(b.check_out), today)),
      inHouse: active.filter(b => {
        const s = parseISO(b.check_in), e = parseISO(b.check_out);
        return isWithinInterval(today, { start: s, end: e }) && !isSameDay(s, today) && !isSameDay(e, today);
      }),
    };
  }, [bookings, today]);

  const mobileBookings = useMemo(() => {
    const active = bookings.filter(b => b.status !== 'cancelled' && b.status !== 'declined');
    return mobileFilter === 'all' ? active : active.filter(b => b.status === mobileFilter);
  }, [bookings, mobileFilter]);

  const pendingCount = bookings.filter(b => b.status === 'pending').length;
  const awaitingCount = bookings.filter(b => b.status === 'awaiting_payment').length;

  return (
    <>
      {/* ── MOBILE VIEW ──────────────────────────────────────────────────── */}
      <div className="md:hidden flex flex-col min-h-screen bg-warm-white pb-24">
        <div className="sticky top-0 z-10 bg-white border-b border-mist px-4 pt-4 pb-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="font-serif text-2xl font-light">Bookings</h1>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && <span className="bg-rose-400 text-white text-[0.6rem] font-bold px-2 py-0.5 rounded-full">{pendingCount} pending</span>}
              {awaitingCount > 0 && <span className="bg-amber-400 text-white text-[0.6rem] font-bold px-2 py-0.5 rounded-full">{awaitingCount} awaiting</span>}
            </div>
          </div>
          <div className="flex gap-0 border-b border-mist -mx-4 px-4">
            {([
              { key: 'all', label: 'All' },
              { key: 'pending', label: 'Pending' },
              { key: 'awaiting_payment', label: 'Awaiting' },
              { key: 'confirmed', label: 'Confirmed' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setMobileFilter(f.key)}
                className={`flex-1 py-2.5 text-[0.6rem] uppercase tracking-widest font-bold border-b-2 transition-all ${mobileFilter === f.key ? 'border-charcoal text-charcoal' : 'border-transparent text-muted'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-4 pb-2">
          <p className="text-[0.6rem] uppercase tracking-widest text-muted font-bold mb-3">Today · {format(today, "d MMM yyyy")}</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Arriving', count: todayActivity.arriving.length, color: 'text-forest', bg: 'bg-forest/10' },
              { label: 'In-House', count: todayActivity.inHouse.length, color: 'text-charcoal', bg: 'bg-charcoal/5' },
              { label: 'Departing', count: todayActivity.departing.length, color: 'text-clay', bg: 'bg-clay/10' },
            ].map(item => (
              <div key={item.label} className={`${item.bg} border border-mist p-3 rounded-sm text-center`}>
                <p className={`text-2xl font-serif font-light ${item.color}`}>{item.count}</p>
                <p className="text-[0.55rem] uppercase tracking-widest text-muted mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-2 flex flex-col gap-3">
          {mobileBookings.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-muted italic text-sm">No bookings in this category</p>
            </div>
          ) : mobileBookings
              .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime())
              .map(booking => {
                const apt = apartments.find((a: any) => a.id === booking.apartment_id);
                const statusConfig = getStatusConfig(booking.status);
                return (
                  <motion.button key={booking.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedBooking(booking)}
                    className="w-full text-left bg-white border border-mist rounded-sm shadow-sm active:scale-[0.99] transition-all">
                    <div className={`h-1 w-full rounded-t-sm ${statusConfig.bar}`} />
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-serif text-base">{getGuestName(booking)}</p>
                          <p className="text-[0.6rem] text-muted font-mono">{booking.reference_number}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-serif text-lg text-forest">€{booking.total_price}</p>
                          <span className={`text-[0.55rem] font-bold uppercase tracking-widest ${statusConfig.text}`}>{statusConfig.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[0.68rem] text-muted">
                        <span className="flex items-center gap-1"><MapPin size={10} className="text-clay" />{apt?.name || "—"}</span>
                        <span className="flex items-center gap-1"><Calendar size={10} />{format(parseISO(booking.check_in), "d MMM")} → {format(parseISO(booking.check_out), "d MMM")}</span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-mist/40 flex items-center justify-between">
                        {booking.status === 'pending' && <span className="text-[0.6rem] text-rose-500 font-bold uppercase tracking-widest flex items-center gap-1"><Bell size={10} /> Needs your approval</span>}
                        {booking.status === 'awaiting_payment' && <span className="text-[0.6rem] text-amber-600 font-bold uppercase tracking-widest flex items-center gap-1"><CreditCard size={10} /> Waiting for payment</span>}
                        {booking.status === 'confirmed' && <span className="text-[0.6rem] text-forest font-bold uppercase tracking-widest flex items-center gap-1"><Check size={10} /> Confirmed</span>}
                        <ChevronRightIcon size={14} className="text-muted" />
                      </div>
                    </div>
                  </motion.button>
                );
              })}
        </div>
      </div>

      {/* ── DESKTOP VIEW ─────────────────────────────────────────────────── */}
      <div className="hidden md:block space-y-12 pb-12">
        <section className="bg-white p-6 border border-mist shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-charcoal/5 rounded-full flex items-center justify-center"><Sparkles size={20} /></div>
            <div>
              <h2 className="font-serif text-2xl font-light">Activity Feed</h2>
              <p className="text-[0.6rem] uppercase tracking-widest text-muted font-bold">Action Required</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookings.filter(b => b.admin_needs_attention).length > 0 ? (
              bookings.filter(b => b.admin_needs_attention).map(b => {
                const guest = Array.isArray(b.guests) ? b.guests[0] : b.guests;
                const guestName = `${guest?.first_name || ""} ${guest?.last_name || ""}`.trim() || "Guest";
                let icon = "📩"; let text = `New Request from ${guestName}`;
                if (b.unread_message_count > 0) { icon = "💬"; text = `${b.unread_message_count} New Message${b.unread_message_count > 1 ? 's' : ''} from ${guestName}`; }
                else if (b.status === 'confirmed') { icon = "💰"; text = `New Confirmed Booking: ${guestName}`; }
                else if (b.status === 'awaiting_payment') { icon = "💳"; text = `Awaiting Payment: ${guestName}`; }
                return (
                  <motion.div key={b.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedBooking(b)}
                    className="flex items-center justify-between p-4 bg-warm-white/50 border border-mist hover:border-clay hover:bg-cream/30 transition-all cursor-pointer group">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{icon}</span>
                      <div>
                        <p className="text-sm font-medium text-charcoal">{text}</p>
                        <p className="text-[0.6rem] uppercase tracking-widest text-muted font-bold">{b.reference_number} · {b.check_in}</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-muted group-hover:text-clay transition-colors" />
                  </motion.div>
                );
              })
            ) : (
              <div className="col-span-full text-center py-10 border-2 border-dashed border-mist/50">
                <p className="text-sm text-muted italic">All caught up! No pending actions.</p>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-mist shadow-sm overflow-hidden">
          <div className="p-6 border-b border-mist flex justify-between items-center bg-cream/20">
            <div>
              <h2 className="font-serif text-xl font-light">Multi-Unit Timeline</h2>
              <p className="text-[0.6rem] uppercase tracking-widest text-muted mt-1">Occupancy & Reservations Overview</p>
            </div>
            <div className="flex items-center gap-2 bg-white border border-mist rounded-sm p-1">
              <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-mist rounded transition-colors"><ChevronLeft size={14} /></button>
              <span className="text-xs font-sans font-bold uppercase tracking-widest px-2 min-w-[120px] text-center">{format(currentMonth, "MMM yyyy")}</span>
              <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-mist rounded transition-colors"><ChevronRight size={14} /></button>
            </div>
          </div>
          <div className="overflow-x-auto no-scrollbar" ref={timelineRef}>
            <div className="min-w-[1200px]">
              <div className="flex border-b border-mist bg-mist/10">
                <div className="w-48 shrink-0 p-4 border-r border-mist text-[0.6rem] uppercase tracking-widest font-bold text-muted">Apartment</div>
                <div className="flex flex-1">
                  {days.map(day => (
                    <div key={day.toISOString()} className={`flex-1 min-w-[40px] p-2 text-center border-r border-mist last:border-r-0 ${isSameDay(day, new Date()) ? 'bg-clay/10' : ''}`}>
                      <div className="text-[0.5rem] uppercase tracking-tighter text-muted">{format(day, "EEE").charAt(0)}</div>
                      <div className={`text-xs font-mono font-bold ${isSameDay(day, new Date()) ? 'text-clay' : 'text-charcoal'}`}>{format(day, "d")}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-mist">
                {apartments.map(apt => {
                  const metrics = days.reduce((acc, day) => {
                    const isBooked = bookings.some(b => b.apartment_id === apt.id && b.status !== 'cancelled' && b.status !== 'declined' && isWithinInterval(day, { start: parseISO(b.check_in), end: parseISO(b.check_out) }) && !isSameDay(day, parseISO(b.check_out)));
                    const { price } = getPriceForDate(apt, day);
                    if (isBooked) { acc.bookedNights++; acc.revenue += price; } else { acc.potential += price; }
                    return acc;
                  }, { bookedNights: 0, revenue: 0, potential: 0 });
                  const occupancyRate = Math.round((metrics.bookedNights / days.length) * 100);
                  return (
                    <div key={apt.id} className="flex group hover:bg-cream/10 transition-colors h-28">
                      <div className="w-48 shrink-0 p-4 border-r border-mist flex flex-col justify-between bg-white group-hover:bg-cream/20 transition-colors">
                        <h4 className="text-[0.75rem] font-serif font-bold text-charcoal leading-tight truncate border-b border-mist/30 pb-2 mb-2">{apt.name}</h4>
                        <div className="grid grid-cols-2 gap-1">
                          {[['Booked', `€${Math.round(metrics.revenue)}`, 'text-forest'], ['Pot.', `€${Math.round(metrics.potential)}`, 'text-clay'], ['Nights', metrics.bookedNights, ''], ['Occ.', `${occupancyRate}%`, '']].map(([label, val, cls]) => (
                            <div key={String(label)} className="flex flex-col">
                              <span className="text-[0.45rem] uppercase tracking-tighter text-muted">{label}</span>
                              <span className={`text-[0.6rem] font-mono font-bold ${cls}`}>{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-1 relative">
                        {days.map(day => {
                          const { price, type } = getPriceForDate(apt, new Date(day));
                          const isBooked = bookings.some(b => b.apartment_id === apt.id && b.status !== 'cancelled' && b.status !== 'declined' && isWithinInterval(day, { start: parseISO(b.check_in), end: parseISO(b.check_out) }) && !isSameDay(day, parseISO(b.check_out)));
                          return (
                            <div key={day.toISOString()} className={`flex-1 min-w-[40px] border-r border-mist/30 last:border-r-0 relative flex flex-col items-center justify-center ${isSameDay(day, new Date()) ? 'bg-clay/5' : ''}`}>
                              {!isBooked && <div className="flex flex-col items-center opacity-40 group-hover:opacity-100 transition-opacity"><span className="text-[0.55rem] font-mono font-bold">€{price}</span>{type && <span className="text-[0.4rem] uppercase tracking-tighter text-clay font-bold truncate max-w-[35px]">{type}</span>}</div>}
                            </div>
                          );
                        })}
                        {bookings.filter(b => b.apartment_id === apt.id && b.status !== 'cancelled' && b.status !== 'declined').map(booking => {
                          const start = parseISO(booking.check_in), end = parseISO(booking.check_out);
                          const monthStart = startOfMonth(currentMonth), monthEnd = endOfMonth(currentMonth);
                          const nextMonthStart = addDays(monthEnd, 1);
                          if (end <= monthStart || start >= nextMonthStart) return null;
                          const displayStart = start < monthStart ? monthStart : start;
                          const displayEnd = end > nextMonthStart ? nextMonthStart : end;
                          const leftDays = differenceInDays(displayStart, monthStart);
                          const durationDays = differenceInDays(displayEnd, displayStart);
                          if (durationDays <= 0) return null;
                          const left = (leftDays / days.length) * 100;
                          const width = (Math.max(0.1, durationDays) / days.length) * 100;
                          const sc = getStatusConfig(booking.status);
                          return (
                            <motion.button key={booking.id} initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1 }}
                              onClick={() => setSelectedBooking(booking)}
                              className={`absolute top-4 bottom-4 rounded-sm shadow-sm flex items-center px-2 overflow-hidden cursor-pointer hover:brightness-110 transition-all z-10 ${sc.color}`}
                              style={{ left: `${left}%`, width: `${width}%` }}>
                              <span className="text-[0.6rem] text-white font-bold truncate uppercase tracking-tighter">{getGuestName(booking)}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-8">
          <div className="col-span-3 flex items-center gap-4 mb-2">
            <h2 className="font-serif text-2xl font-light">Today's Activity</h2>
            <div className="h-px flex-1 bg-mist" />
            <span className="text-[0.7rem] font-sans font-bold uppercase tracking-widest text-clay">{format(today, "EEEE, MMMM do")}</span>
          </div>
          {[
            { label: 'Arriving', items: todayActivity.arriving, color: 'text-forest', countBg: 'bg-forest/10 text-forest' },
            { label: 'In-House', items: todayActivity.inHouse, color: 'text-charcoal', countBg: 'bg-charcoal/10 text-charcoal' },
            { label: 'Departing', items: todayActivity.departing, color: 'text-clay', countBg: 'bg-clay/10 text-clay' },
          ].map(col => (
            <div key={col.label} className="bg-white border border-mist p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-[0.7rem] uppercase tracking-[0.2em] font-bold ${col.color}`}>{col.label}</h3>
                <span className={`text-[0.6rem] px-2 py-0.5 rounded-full font-bold ${col.countBg}`}>{col.items.length}</span>
              </div>
              <div className="space-y-4">
                {col.items.length > 0 ? col.items.map(b => <ActivityCard key={b.id} booking={b} apartments={apartments} onClick={() => setSelectedBooking(b)} />) : <EmptyState message={`No ${col.label.toLowerCase()} today`} />}
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* ── Shared drawer and modal — rendered outside mobile/desktop split ── */}
      <BookingDrawer
        selectedBooking={selectedBooking}
        apartments={apartments}
        guestMessage={guestMessage}
        setGuestMessage={setGuestMessage}
        sendingMessage={sendingMessage}
        messageSent={messageSent}
        acknowledging={acknowledging}
        onClose={() => setSelectedBooking(null)}
        onSendMessage={handleSendMessage}
        onAcknowledge={handleAcknowledge}
        onConfirm={setConfirmation}
      />

      <ConfirmModal
        confirmation={confirmation}
        onCancel={() => setConfirmation(null)}
        onConfirm={handleConfirmAction}
      />
    </>
  );
}
