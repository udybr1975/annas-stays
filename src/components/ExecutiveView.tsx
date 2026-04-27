import { useState, useMemo, useRef, useEffect } from "react";
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
import { ChevronLeft, ChevronRight, User, Calendar, Clock, MapPin, Phone, Mail, Trash2, X, AlertCircle, Send, RefreshCw, Check, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../lib/supabase";

interface ExecutiveViewProps {
  bookings: any[];
  apartments: any[];
  specialPrices: any[];
  onCancelBooking: (id: string) => void;
  onUpdateBookingStatus?: (id: string, status: string) => void;
}

const getGuestName = (booking: any) => {
  if (!booking) return "Unknown";
  const guestData = booking.guests;
  if (!guestData) return "Guest";
  
  // Handle both object and array (Supabase sometimes returns array for joins)
  const guest = Array.isArray(guestData) ? guestData[0] : guestData;
  
  if (!guest) return "Guest";
  
  const firstName = guest.first_name || "";
  const lastName = guest.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();
  
  return fullName || "Unnamed Guest";
};

export default function ExecutiveView({ bookings, apartments, specialPrices, onCancelBooking, onUpdateBookingStatus }: ExecutiveViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [guestMessage, setGuestMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  const handleAcknowledge = async (bookingId: string) => {
    setAcknowledging(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ 
          admin_needs_attention: false,
          unread_message_count: 0
        })
        .eq('id', bookingId);

      if (error) throw error;
      
      if (selectedBooking && selectedBooking.id === bookingId) {
        setSelectedBooking({ 
          ...selectedBooking, 
          admin_needs_attention: false, 
          unread_message_count: 0 
        });
      }
    } catch (error) {
      console.error("Error acknowledging booking:", error);
    } finally {
      setAcknowledging(false);
    }
  };

  const [confirmation, setConfirmation] = useState<{
    type: 'accept' | 'decline' | 'cancel';
    bookingId: string;
    message: string;
  } | null>(null);

const handleConfirmAction = () => {
    if (!confirmation) return;
    
    if (confirmation.type === 'accept') {
      onUpdateBookingStatus?.(confirmation.bookingId, 'confirmed');
    } else if (confirmation.type === 'decline') {
      onUpdateBookingStatus?.(confirmation.bookingId, 'declined');
    } else if (confirmation.type === 'cancel') {
      onCancelBooking(confirmation.bookingId);
    } else if (confirmation.type === 'resend') {
      onUpdateBookingStatus?.(confirmation.bookingId, 'resend_payment_link');
    }
    
    setConfirmation(null);
    setSelectedBooking(null);
    setGuestMessage("");
    setMessageSent(false);
  };

  const handleSendMessage = async () => {
    if (!selectedBooking || !guestMessage.trim()) return;
    
    setSendingMessage(true);
    const apt = apartments.find(a => a.id === selectedBooking.apartment_id);
    const guestData = selectedBooking.guests;
    const guest = Array.isArray(guestData) ? guestData[0] : guestData;
    const guestEmail = guest?.email;
    
    if (!guestEmail) {
      alert("Guest email not found.");
      setSendingMessage(false);
      return;
    }

    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm");
    const newMessage = `[${timestamp}] Host: ${guestMessage.trim()}`;
    const updatedNotes = selectedBooking.notes 
      ? `${selectedBooking.notes}\n---\n${newMessage}` 
      : newMessage;

    try {
      // 1. Update Database
      const { error: dbError } = await supabase
        .from('bookings')
        .update({ 
          notes: updatedNotes,
          last_message_at: new Date().toISOString(),
          admin_needs_attention: false,
          unread_message_count: 0
        })
        .eq('id', selectedBooking.id);

      if (dbError) throw dbError;

      // 2. Send Email
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: guestEmail,
          subject: `Thank you for your request to stay at ${apt?.name || "our apartment"}`,
          html: `
            <div style="font-family: sans-serif; color: #2C2C2A; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E8E3DC;">
              <p>${guestMessage.replace(/\n/g, '<br>')}</p>
              <p style="margin-top: 30px;">Best regards,<br><strong>Anna's Stays</strong></p>
              <hr style="border: none; border-top: 1px solid #E8E3DC; margin: 20px 0;">
              <p style="font-size: 12px; color: #7A756E;">To reply to this message, please visit your <a href="${window.location.origin}/manage-booking/${selectedBooking.id}?email=${encodeURIComponent(guestEmail)}">Manage Booking</a> page.</p>
            </div>
          `
        })
      });

      if (response.ok) {
        setMessageSent(true);
        setGuestMessage("");
        // Update local state
        setSelectedBooking({ 
          ...selectedBooking, 
          notes: updatedNotes,
          admin_needs_attention: false,
          unread_message_count: 0
        });
        setTimeout(() => setMessageSent(false), 5000);
      } else {
        alert("Failed to send email, but message was saved to log.");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("An error occurred while sending the message.");
    } finally {
      setSendingMessage(false);
    }
  };

  const timelineRef = useRef<HTMLDivElement>(null);

  const getPriceForDate = (apt: any, date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    // Priority 1: Special Event Price
    const special = specialPrices.find(p => {
      if (String(p.apartment_id) !== String(apt.id)) return false;
      if (p.pricing_type === 'season') return false;
      const start = new Date(p.start_date || p.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(p.end_date || p.date);
      end.setHours(0, 0, 0, 0);
      return d >= start && d <= end;
    });
    
    if (special) return { 
      price: special.price_override || special.price, 
      type: special.event_name || "Special"
    };

    // Priority 2: Seasonal Pricing
    const season = specialPrices.find(p => {
      if (String(p.apartment_id) !== String(apt.id)) return false;
      if (p.pricing_type !== 'season') return false;
      const start = new Date(p.start_date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(p.end_date);
      end.setHours(0, 0, 0, 0);
      return d >= start && d <= end;
    });

    if (season) {
      const day = d.getDay();
      const isWeekend = day === 5 || day === 6;
      return {
        price: isWeekend ? (season.weekend_price_override || season.price_override) : season.price_override,
        type: null // Remove seasonal labels from calendar display
      };
    }

    // Priority 3: Base Price
    return { price: apt.price_per_night || apt.price, type: null };
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Today's Activity Logic
  const today = startOfDay(new Date());
  const todayActivity = useMemo(() => {
    const arriving = bookings.filter(b => b.status?.toLowerCase() !== 'cancelled' && b.status?.toLowerCase() !== 'declined' && isSameDay(parseISO(b.check_in), today));
    const departing = bookings.filter(b => b.status?.toLowerCase() !== 'cancelled' && b.status?.toLowerCase() !== 'declined' && isSameDay(parseISO(b.check_out), today));
    const inHouse = bookings.filter(b => {
      if (b.status?.toLowerCase() === 'cancelled' || b.status?.toLowerCase() === 'declined') return false;
      const start = parseISO(b.check_in);
      const end = parseISO(b.check_out);
      return isWithinInterval(today, { start, end }) && !isSameDay(start, today) && !isSameDay(end, today);
    });

    return { arriving, departing, inHouse };
  }, [bookings, today]);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return 'bg-forest';
      case 'cancelled': return 'bg-clay';
      case 'pending': return 'bg-rose-400';
      default: return 'bg-charcoal';
    }
  };

  return (
    <div className="space-y-8 md:space-y-12 pb-12">
      {/* Activity Feed / To-Do List */}
      <section className="bg-white p-4 md:p-6 border border-mist shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-charcoal/5 rounded-full flex items-center justify-center text-charcoal">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="font-serif text-xl md:text-2xl font-light">Activity Feed</h2>
            <p className="text-[0.6rem] uppercase tracking-widest text-muted font-bold">Action Required</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bookings.filter(b => b.admin_needs_attention).length > 0 ? (
            bookings
              .filter(b => b.admin_needs_attention)
              .map(b => {
                const guest = Array.isArray(b.guests) ? b.guests[0] : b.guests;
                const guestName = guest?.name || `${guest?.first_name || ""} ${guest?.last_name || ""}`.trim() || "Guest";
                
                let icon = "📩";
                let text = `New Request from ${guestName}`;

                if (b.unread_message_count > 0) {
                  icon = "💬";
                  text = `${b.unread_message_count} New Message${b.unread_message_count > 1 ? 's' : ''} from ${guestName}`;
                } else if (b.status === 'confirmed') {
                  icon = "💰";
                  text = `New Confirmed Booking: ${guestName}`;
                }

                return (
                  <motion.div 
                    key={b.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedBooking(b)}
                    className="flex items-center justify-between p-4 bg-warm-white/50 border border-mist hover:border-clay hover:bg-cream/30 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{icon}</span>
                      <div>
                        <p className="text-sm font-medium text-charcoal">{text}</p>
                        <p className="text-[0.6rem] uppercase tracking-widest text-muted font-bold">
                          {b.reference_number} • {b.check_in}
                        </p>
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

      {/* Section 1: Multi-Unit Timeline */}
      <section className="bg-white border border-mist shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-mist flex flex-col sm:flex-row justify-between items-start sm:items-center bg-cream/20 gap-4">
          <div>
            <h2 className="font-serif text-lg md:text-xl font-light">Multi-Unit Timeline</h2>
            <p className="text-[0.6rem] uppercase tracking-widest text-muted mt-1">Occupancy & Reservations Overview</p>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-white border border-mist rounded-sm p-1 w-full sm:w-auto justify-between sm:justify-start">
              <button onClick={prevMonth} className="p-1 hover:bg-mist rounded transition-colors"><ChevronLeft size={14} /></button>
              <span className="text-[0.6rem] md:text-xs font-sans font-bold uppercase tracking-widest px-1 md:px-2 min-w-[80px] md:min-w-[120px] text-center">
                {format(currentMonth, "MMM yyyy")}
              </span>
              <button onClick={nextMonth} className="p-1 hover:bg-mist rounded transition-colors"><ChevronRight size={14} /></button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar touch-pan-x" ref={timelineRef}>
          <div className="min-w-[600px] md:min-w-[1200px]">
            {/* Timeline Header */}
            <div className="flex border-b border-mist bg-mist/10">
              <div className="w-20 md:w-48 shrink-0 p-2 md:p-4 border-r border-mist text-[0.45rem] md:text-[0.6rem] uppercase tracking-widest font-bold text-muted">Apt</div>
              <div className="flex flex-1">
                {days.map(day => (
                  <div key={day.toISOString()} className={`flex-1 min-w-[20px] md:min-w-[40px] p-1 md:p-2 text-center border-r border-mist last:border-r-0 ${isSameDay(day, new Date()) ? 'bg-clay/10' : ''}`}>
                    <div className="text-[0.35rem] md:text-[0.5rem] uppercase tracking-tighter text-muted">{format(day, "EEE").charAt(0)}</div>
                    <div className={`text-[0.55rem] md:text-xs font-mono font-bold ${isSameDay(day, new Date()) ? 'text-clay' : 'text-charcoal'}`}>{format(day, "d")}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline Rows */}
            <div className="divide-y divide-mist">
              {apartments.map(apt => {
                // Calculate Monthly Metrics
                const monthlyMetrics = days.reduce((acc, day) => {
                  const isBooked = bookings.some(b => 
                    b.apartment_id === apt.id && 
                    b.status?.toLowerCase() !== 'cancelled' &&
                    b.status?.toLowerCase() !== 'declined' &&
                    isWithinInterval(day, { 
                      start: parseISO(b.check_in), 
                      end: parseISO(b.check_out) 
                    }) &&
                    !isSameDay(day, parseISO(b.check_out))
                  );

                  const { price } = getPriceForDate(apt, day);

                  if (isBooked) {
                    acc.bookedNights += 1;
                    acc.revenue += price;
                  } else {
                    acc.potential += price;
                  }
                  return acc;
                }, { bookedNights: 0, revenue: 0, potential: 0 });

                const occupancyRate = Math.round((monthlyMetrics.bookedNights / days.length) * 100);

                return (
                  <div key={apt.id} className="flex group hover:bg-cream/10 transition-colors h-16 md:h-28">
                    <div className="w-20 md:w-48 shrink-0 p-1.5 md:p-4 border-r border-mist flex flex-col justify-between bg-white group-hover:bg-cream/20 transition-colors">
                      <div className="border-b border-mist/30 pb-0.5 md:pb-2 mb-0.5 md:mb-2">
                        <h4 className="text-[0.55rem] md:text-[0.75rem] font-serif font-bold text-charcoal leading-tight truncate">{apt.name}</h4>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-y-0.5 md:gap-y-1 gap-x-0.5 md:gap-x-2">
                        <div className="flex flex-col">
                          <span className="text-[0.3rem] md:text-[0.45rem] uppercase tracking-tighter text-muted">Booked</span>
                          <span className="text-[0.45rem] md:text-[0.6rem] font-mono font-bold text-forest">€{Math.round(monthlyMetrics.revenue)}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[0.3rem] md:text-[0.45rem] uppercase tracking-tighter text-muted">Pot.</span>
                          <span className="text-[0.45rem] md:text-[0.6rem] font-mono font-bold text-clay">€{Math.round(monthlyMetrics.potential)}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[0.3rem] md:text-[0.45rem] uppercase tracking-tighter text-muted">Nights</span>
                          <span className="text-[0.45rem] md:text-[0.6rem] font-mono font-bold">{monthlyMetrics.bookedNights}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[0.3rem] md:text-[0.45rem] uppercase tracking-tighter text-muted">Occ.</span>
                          <span className="text-[0.45rem] md:text-[0.6rem] font-mono font-bold">{occupancyRate}%</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-1 relative">
                      {/* Day Grid Lines & Prices */}
                      {days.map(day => {
                        const { price, type } = getPriceForDate(apt, new Date(day));
                        const isBooked = bookings.some(b => 
                          b.apartment_id === apt.id && 
                          b.status?.toLowerCase() !== 'cancelled' &&
                          b.status?.toLowerCase() !== 'declined' &&
                          isWithinInterval(day, { 
                            start: parseISO(b.check_in), 
                            end: parseISO(b.check_out) 
                          }) &&
                          !isSameDay(day, parseISO(b.check_out)) // Don't show as booked on checkout day for price display
                        );

                        return (
                          <div key={day.toISOString()} className={`flex-1 min-w-[20px] md:min-w-[40px] border-r border-mist/30 last:border-r-0 relative flex flex-col items-center justify-center ${isSameDay(day, new Date()) ? 'bg-clay/5' : ''}`}>
                            {!isBooked && (
                              <div className="flex flex-col items-center justify-center opacity-40 group-hover:opacity-100 transition-opacity">
                                <span className="text-[0.4rem] md:text-[0.55rem] font-mono font-bold">€{price}</span>
                                {type && <span className="hidden md:block text-[0.4rem] uppercase tracking-tighter text-clay font-bold truncate max-w-[35px]">{type}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Booking Bars */}
                      {bookings
                        .filter(b => b.apartment_id === apt.id && b.status?.toLowerCase() !== 'cancelled' && b.status?.toLowerCase() !== 'declined')
                        .map(booking => {
                          const start = parseISO(booking.check_in);
                          const end = parseISO(booking.check_out);
                          
                          const monthStart = startOfMonth(currentMonth);
                          const monthEnd = endOfMonth(currentMonth);
                          const nextMonthStart = addDays(monthEnd, 1);
                          
                          // Skip if booking is entirely outside current month
                          if (end <= monthStart || start >= nextMonthStart) return null;

                          const displayStart = start < monthStart ? monthStart : start;
                          const displayEnd = end > nextMonthStart ? nextMonthStart : end;
                          
                          const leftDays = differenceInDays(displayStart, monthStart);
                          const durationDays = differenceInDays(displayEnd, displayStart);
                          
                          if (durationDays <= 0 && !isSameDay(displayStart, displayEnd)) return null;

                          const left = (leftDays / days.length) * 100;
                          const width = (Math.max(0.1, durationDays) / days.length) * 100;

                          return (
                            <motion.button
                              key={booking.id}
                              initial={{ opacity: 0, scaleX: 0 }}
                              animate={{ opacity: 1, scaleX: 1 }}
                              onClick={() => setSelectedBooking(booking)}
                              className={`absolute top-1.5 bottom-1.5 md:top-4 md:bottom-4 rounded-sm shadow-sm flex items-center px-0.5 md:px-2 overflow-hidden cursor-pointer hover:brightness-110 transition-all z-10 ${getStatusColor(booking.status)} ${booking.status === 'cancelled' ? 'opacity-40 grayscale-[0.5]' : ''}`}
                              style={{ left: `${left}%`, width: `${width}%` }}
                            >
                              <span className="text-[0.4rem] md:text-[0.6rem] text-white font-bold truncate uppercase tracking-tighter">
                                {getGuestName(booking)}
                              </span>
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

      {/* Section 2: Daily Operations Agenda */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-4 mb-2">
          <h2 className="font-serif text-xl md:text-2xl font-light">Today's Activity</h2>
          <div className="h-px flex-1 bg-mist" />
          <span className="text-[0.6rem] md:text-[0.7rem] font-sans font-bold uppercase tracking-widest text-clay">{format(today, "EEEE, MMMM do")}</span>
        </div>

        {/* Arriving */}
        <div className="bg-white border border-mist p-4 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[0.65rem] md:text-[0.7rem] uppercase tracking-[0.2em] font-bold text-forest">Arriving</h3>
            <span className="bg-forest/10 text-forest text-[0.6rem] px-2 py-0.5 rounded-full font-bold">{todayActivity.arriving.length}</span>
          </div>
          <div className="space-y-4">
            {todayActivity.arriving.length > 0 ? todayActivity.arriving.map(b => (
              <ActivityCard key={b.id} booking={b} apartments={apartments} onClick={() => setSelectedBooking(b)} />
            )) : <EmptyState message="No arrivals today" />}
          </div>
        </div>

        {/* In-House */}
        <div className="bg-white border border-mist p-4 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[0.65rem] md:text-[0.7rem] uppercase tracking-[0.2em] font-bold text-charcoal">In-House</h3>
            <span className="bg-charcoal/10 text-charcoal text-[0.6rem] px-2 py-0.5 rounded-full font-bold">{todayActivity.inHouse.length}</span>
          </div>
          <div className="space-y-4">
            {todayActivity.inHouse.length > 0 ? todayActivity.inHouse.map(b => (
              <ActivityCard key={b.id} booking={b} apartments={apartments} onClick={() => setSelectedBooking(b)} />
            )) : <EmptyState message="No guests currently in-house" />}
          </div>
        </div>

        {/* Departing */}
        <div className="bg-white border border-mist p-4 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[0.65rem] md:text-[0.7rem] uppercase tracking-[0.2em] font-bold text-clay">Departing</h3>
            <span className="bg-clay/10 text-clay text-[0.6rem] px-2 py-0.5 rounded-full font-bold">{todayActivity.departing.length}</span>
          </div>
          <div className="space-y-4">
            {todayActivity.departing.length > 0 ? todayActivity.departing.map(b => (
              <ActivityCard key={b.id} booking={b} apartments={apartments} onClick={() => setSelectedBooking(b)} />
            )) : <EmptyState message="No departures today" />}
          </div>
        </div>
      </section>

      {/* Booking Detail Drawer */}
      <AnimatePresence>
        {selectedBooking && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBooking(null)}
              className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-[4000]"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-full md:max-w-md bg-warm-white shadow-2xl z-[4001] border-l border-mist flex flex-col"
            >
              <div className="p-4 md:p-6 border-b border-mist flex justify-between items-center bg-white">
                <h3 className="font-serif text-lg md:text-xl">
                  {selectedBooking.status === 'pending' ? "Pending Reservation" : "Reservation Details"}
                </h3>
                <button onClick={() => setSelectedBooking(null)} className="p-2 hover:bg-mist rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 md:space-y-8">
                {/* Guest Info */}
                <div>
                  <label className="text-[0.6rem] uppercase tracking-widest text-muted font-bold block mb-3 md:mb-4">Guest Information</label>
                  <div className="bg-white border border-mist p-4 md:p-6 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-clay/10 rounded-full flex items-center justify-center text-clay">
                        <User size={20} className="md:size-24" />
                      </div>
                      <div>
                        <h4 className="font-serif text-base md:text-lg">{getGuestName(selectedBooking)}</h4>
                        <p className="text-[0.65rem] md:text-xs text-muted">Ref: {selectedBooking.reference_number}</p>
                      </div>
                    </div>
                    <div className="space-y-2 pt-4 border-t border-mist/50">
                      <div className="flex items-center gap-3 text-[0.7rem] md:text-xs text-muted truncate">
                        <Mail size={14} className="text-clay shrink-0" /> {selectedBooking.guests?.email}
                      </div>
                      {selectedBooking.guests?.phone && (
                        <div className="flex items-center gap-3 text-[0.7rem] md:text-xs text-muted">
                          <Phone size={14} className="text-clay shrink-0" /> {selectedBooking.guests?.phone}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stay Info */}
                <div>
                  <label className="text-[0.6rem] uppercase tracking-widest text-muted font-bold block mb-3 md:mb-4">Stay Details</label>
                  <div className="bg-white border border-mist p-4 md:p-6 space-y-4 md:space-y-6">
                    <div className="flex items-start gap-4">
                      <MapPin size={18} className="text-clay mt-1 shrink-0" />
                      <div>
                        <p className="text-[0.65rem] md:text-xs font-bold uppercase tracking-widest text-charcoal">Apartment</p>
                        <p className="text-sm font-serif">{apartments.find(a => a.id === selectedBooking.apartment_id)?.name || "Unknown"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                      <div className="flex items-start gap-4">
                        <Calendar size={18} className="text-clay mt-1 shrink-0" />
                        <div>
                          <p className="text-[0.65rem] md:text-xs font-bold uppercase tracking-widest text-charcoal">Check-In</p>
                          <p className="text-sm font-mono">{format(parseISO(selectedBooking.check_in), "MMM d, yyyy")}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <Clock size={18} className="text-clay mt-1 shrink-0" />
                        <div>
                          <p className="text-[0.65rem] md:text-xs font-bold uppercase tracking-widest text-charcoal">Check-Out</p>
                          <p className="text-sm font-mono">{format(parseISO(selectedBooking.check_out), "MMM d, yyyy")}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Financials */}
                <div className={`${selectedBooking.status === 'pending' ? 'bg-clay' : 'bg-charcoal'} text-white p-4 md:p-6 rounded-sm shadow-lg`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[0.6rem] uppercase tracking-widest opacity-60">Total Amount</span>
                    <span className="text-[0.55rem] md:text-[0.6rem] uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded">
                      {selectedBooking.status === 'pending' ? "Potential Earning" : "Paid"}
                    </span>
                  </div>
                  <div className="text-2xl md:text-3xl font-serif">€{selectedBooking.total_price}</div>
                </div>

                {/* Message Log */}
                <div className="space-y-4 pb-4">
                  <label className="text-[0.6rem] uppercase tracking-widest text-muted font-bold block">Message Log</label>
                  <div className="bg-white border border-mist p-4 max-h-[250px] md:max-h-[300px] overflow-y-auto space-y-3 font-sans text-[0.7rem]">
                    {selectedBooking.notes ? (
                      selectedBooking.notes.split('---').map((msg: string, i: number) => (
                        <div key={i} className={`p-3 rounded-sm ${msg.includes('Host:') ? 'bg-forest/5 border-l-2 border-forest' : 'bg-clay/5 border-l-2 border-clay'}`}>
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.trim()}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted italic text-center py-4">No messages yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 md:p-6 border-t border-mist bg-white space-y-3">
                {/* Message Guest Section - Now available for all bookings */}
                <div className="mb-4 space-y-2">
                  <label className="text-[0.6rem] uppercase tracking-widest text-muted font-bold block">Send Message to Guest</label>
                  <div className="flex flex-col gap-2">
                    <textarea 
                      value={guestMessage}
                      onChange={(e) => setGuestMessage(e.target.value)}
                      className="w-full bg-cream/20 border border-mist p-3 text-xs min-h-[80px] outline-none focus:border-clay resize-none"
                      placeholder="Type your message here..."
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={!guestMessage.trim() || sendingMessage}
                      className="w-full bg-charcoal text-white px-4 py-3 text-[0.65rem] uppercase tracking-widest hover:bg-charcoal/90 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {sendingMessage ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                      <span>{sendingMessage ? "Sending" : "Send Message"}</span>
                    </button>
                  </div>
                  {messageSent && (
                    <motion.p 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[0.6rem] text-forest font-bold uppercase tracking-widest flex items-center gap-1"
                    >
                      <Check size={10} /> Message Sent Successfully
                    </motion.p>
                  )}
                </div>

                {selectedBooking.admin_needs_attention && (
                  <button
                    onClick={() => handleAcknowledge(selectedBooking.id)}
                    disabled={acknowledging}
                    className="w-full bg-forest/10 text-forest border border-forest/20 p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-forest/20 transition-all flex items-center justify-center gap-2 mb-2"
                  >
                    {acknowledging ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                    {acknowledging ? "Acknowledging..." : "Acknowledge / Mark as Read"}
                  </button>
                )}

{selectedBooking.status === 'pending' && (
                  <>
                    <button
                      onClick={() => setConfirmation({ type: 'accept', bookingId: selectedBooking.id, message: "Approve this request? A payment link will be sent to the guest by email." })}
                      className="w-full bg-forest text-white p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-forest/90 transition-all flex items-center justify-center gap-2"
                    >
                      Approve & Send Payment Link
                    </button>
                    <button
                      onClick={() => setConfirmation({ type: 'decline', bookingId: selectedBooking.id, message: "Are you sure you want to decline this reservation request?" })}
                      className="w-full bg-clay text-white p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-clay/90 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={14} /> Decline Request
                    </button>
                  </>
                )}

                {selectedBooking.status === 'awaiting_payment' && (
                  <>
                    <div className="w-full p-3 bg-clay/10 border border-clay/20 text-clay text-[0.68rem] tracking-wide uppercase font-medium text-center">
                      Awaiting Guest Payment
                      {selectedBooking.payment_link_expires_at && (
                        <span className="block normal-case text-[0.65rem] mt-1 text-muted">
                          Link expires: {new Date(selectedBooking.payment_link_expires_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setConfirmation({ type: 'resend', bookingId: selectedBooking.id, message: "Resend a new 24-hour payment link to the guest?" })}
                      className="w-full bg-charcoal text-white p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-charcoal/90 transition-all flex items-center justify-center gap-2"
                    >
                      Resend Payment Link
                    </button>
                    <button
                      onClick={() => setConfirmation({ type: 'cancel', bookingId: selectedBooking.id, message: "Cancel this reservation and release the dates?" })}
                      className="w-full bg-clay text-white p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-clay/90 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={14} /> Cancel & Release Dates
                    </button>
                  </>
                )}

                {selectedBooking.status === 'confirmed' && (
                  <button
                    onClick={() => setConfirmation({ type: 'cancel', bookingId: selectedBooking.id, message: "Are you sure you want to cancel this confirmed reservation?" })}
                    className="w-full bg-clay text-white p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-clay/90 transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 size={14} /> Cancel Reservation
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
        {confirmation && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmation(null)}
              className="fixed inset-0 bg-charcoal/60 backdrop-blur-md z-[5000]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white shadow-2xl z-[5001] p-8 text-center"
            >
              <div className="w-16 h-16 bg-clay/10 rounded-full flex items-center justify-center text-clay mx-auto mb-6">
                <AlertCircle size={32} />
              </div>
              <h4 className="font-serif text-xl mb-4 text-charcoal">Confirm Action</h4>
              <p className="text-sm text-muted mb-8 leading-relaxed">
                {confirmation.message}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmation(null)}
                  className="flex-1 px-6 py-3 border border-mist text-[0.7rem] tracking-widest uppercase hover:bg-mist transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAction}
                  className={`flex-1 px-6 py-3 text-white text-[0.7rem] tracking-widest uppercase transition-all ${
                    confirmation.type === 'accept' ? 'bg-forest hover:bg-forest/90' : 'bg-clay hover:bg-clay/90'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActivityCard({ booking, apartments, onClick }: { booking: any, apartments: any[], onClick: () => void }) {
  const apt = apartments.find(a => a.id === booking.apartment_id);
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-cream/20 border border-mist/50 p-4 hover:bg-white hover:shadow-md transition-all group"
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-serif text-sm group-hover:text-clay transition-colors">
          {getGuestName(booking)}
        </h4>
        <span className="text-[0.5rem] font-mono text-muted">{booking.reference_number}</span>
      </div>
      <p className="text-[0.65rem] text-muted truncate mb-3 flex items-center gap-1.5">
        <MapPin size={10} /> {apt?.name || "Unknown"}
      </p>
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
