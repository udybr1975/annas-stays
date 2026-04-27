import { useState, useEffect } from "react";
import { C, MONTHS } from "../constants";
import { supabase } from "../lib/supabase";

interface CalendarProps {
  listingId: string;
  onRangeChange?: (range: { start: string | null; end: string | null }) => void;
  specialPrices?: any[];
  basePrice?: number;
  refreshTrigger?: number;
}

export default function Calendar({ listingId, onRangeChange, specialPrices = [], basePrice = 0, refreshTrigger = 0 }: CalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [calY, setCalY] = useState(today.getFullYear());
  const [calM, setCalM] = useState(today.getMonth());
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [bookedDates, setBookedDates] = useState<string[]>([]);

  useEffect(() => {
    fetchBookedDates();
  }, [listingId, refreshTrigger]);

  const fetchBookedDates = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('check_in, check_out, status, payment_link_expires_at')
      .eq('apartment_id', listingId)
      .in('status', ['confirmed', 'awaiting_payment']);

    if (error) {
      console.error("Error fetching booked dates:", error);
      return;
    }

    const now = new Date();
    const dates: string[] = [];
    (data || []).forEach(booking => {
      // For awaiting_payment: only block if the payment link has not yet expired
      if (booking.status === 'awaiting_payment' && booking.payment_link_expires_at) {
        const expires = new Date(booking.payment_link_expires_at);
        if (expires <= now) return; // link expired — release the dates
      }
      let curr = new Date(booking.check_in);
      const last = new Date(booking.check_out);
      while (curr < last) {
        dates.push(curr.toISOString().split('T')[0]);
        curr.setDate(curr.getDate() + 1);
      }
    });
    setBookedDates(dates);
  };

  const daysInMonth = new Date(calY, calM + 1, 0).getDate();
  const firstDow = new Date(calY, calM, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  const fmt = (d: number) => calY + "-" + String(calM + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  const isPast = (d: number) => {
    const check = new Date(calY, calM, d);
    check.setHours(0, 0, 0, 0);
    return check < today;
  };
  const isBooked = (d: number) => bookedDates.includes(fmt(d));

  const getDayInfo = (d: number) => {
    const dateStr = fmt(d);
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay();
    const isWeekend = day === 5 || day === 6;

    const event = specialPrices.find(p => {
      if (p.pricing_type === 'season') return false;
      const s = new Date(p.start_date || p.date); s.setHours(0, 0, 0, 0);
      const e = new Date(p.end_date || p.date); e.setHours(0, 0, 0, 0);
      return date >= s && date <= e;
    });
    if (event) return { type: 'event', name: event.event_name, price: event.price_override || event.price, isWeekend };

    const season = specialPrices.find(p => {
      if (p.pricing_type !== 'season') return false;
      const s = new Date(p.start_date); s.setHours(0, 0, 0, 0);
      const e = new Date(p.end_date); e.setHours(0, 0, 0, 0);
      return date >= s && date <= e;
    });
    if (season) {
      const sType = season.event_name?.toLowerCase().includes('high') ? 'high' : 'shoulder';
      const price = isWeekend ? (season.weekend_price_override || season.price_override) : season.price_override;
      return { type: sType, name: season.event_name, price, isWeekend };
    }

    return { type: 'base', name: 'Base Rate', price: basePrice, isWeekend };
  };

  const click = (d: number) => {
    if (isPast(d) || isBooked(d)) return;
    const k = fmt(d);
    if (!start || (start && end)) {
      setStart(k); setEnd(null);
      onRangeChange && onRangeChange({ start: k, end: null });
    } else {
      const s = k < start ? k : start;
      const e = k < start ? start : k;
      let hasOverlap = false;
      let curr = new Date(s);
      const last = new Date(e);
      while (curr < last) {
        const checkStr = curr.toISOString().split('T')[0];
        if (bookedDates.includes(checkStr)) { hasOverlap = true; break; }
        curr.setDate(curr.getDate() + 1);
      }
      if (hasOverlap) {
        alert("Your selection includes dates that are already booked. Please choose a different range.");
        setStart(null); setEnd(null);
        onRangeChange && onRangeChange({ start: null, end: null });
        return;
      }
      setStart(s); setEnd(e);
      onRangeChange && onRangeChange({ start: s, end: e });
    }
  };

  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-3.5">
        <button
          onClick={() => calM === 0 ? (setCalM(11), setCalY(y => y - 1)) : setCalM(m => m - 1)}
          className="bg-none border border-mist px-3 py-1 cursor-pointer text-sm text-muted font-sans hover:bg-mist/20 transition-colors"
        >‹</button>
        <span className="font-serif text-lg font-light">{MONTHS[calM]} {calY}</span>
        <button
          onClick={() => calM === 11 ? (setCalM(0), setCalY(y => y + 1)) : setCalM(m => m + 1)}
          className="bg-none border border-mist px-3 py-1 cursor-pointer text-sm text-muted font-sans hover:bg-mist/20 transition-colors"
        >›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(d => (
          <div key={d} className="text-center text-[0.6rem] tracking-widest uppercase text-muted py-1 font-sans">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateStr = fmt(d);
          const sel = dateStr === start || dateStr === end;
          const ir = start && end && dateStr > start && dateStr < end;
          const past = isPast(d), bk = isBooked(d);
          const info = getDayInfo(d);

          let bgClass = "bg-transparent";
          let textClass = "text-charcoal";
          let borderClass = "";

          if (sel) { bgClass = "bg-forest"; textClass = "text-white"; }
          else if (ir) { bgClass = "bg-forest/20"; }
          else if (!past && !bk) {
            if (info.type === 'event') { bgClass = "bg-[#FFC107]"; textClass = "text-white"; }
            else if (info.type === 'high') { bgClass = "bg-[#E0F7FA]"; }
            else if (info.type === 'shoulder') { borderClass = "border-b-2 border-[#E0F7FA]"; }
          }
          if (past || bk) textClass = "text-[#ddd]";

          return (
            <div
              key={i}
              onClick={() => click(d)}
              onMouseEnter={() => !past && !bk && setHoveredDate(dateStr)}
              onMouseLeave={() => setHoveredDate(null)}
              className={`relative text-center py-2 px-0.5 text-sm font-sans font-light select-none transition-all duration-200 ${past || bk ? "cursor-default" : "cursor-pointer"} ${bgClass} ${textClass} ${borderClass} ${bk ? "line-through" : ""}`}
            >
              {d}
              {info.isWeekend && !sel && !ir && !past && !bk && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-muted/40 rounded-full" />
              )}
              {hoveredDate === dateStr && !sel && !ir && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[50] pointer-events-none">
                  <div className="bg-charcoal text-white text-[0.65rem] py-1.5 px-2.5 rounded shadow-xl whitespace-nowrap flex flex-col items-center gap-0.5">
                    <span className="font-medium tracking-wider uppercase">{info.name}</span>
                    <span className="font-serif text-xs">€{info.price}</span>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-charcoal" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-mist flex flex-wrap gap-x-6 gap-y-2 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-[#FFC107] rounded-full" />
          <span className="text-[0.62rem] tracking-widest uppercase text-muted font-sans">Special Event</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-[#E0F7FA] rounded-full" />
          <span className="text-[0.62rem] tracking-widest uppercase text-muted font-sans">High Season</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-b-2 border-[#E0F7FA]" />
          <span className="text-[0.62rem] tracking-widest uppercase text-muted font-sans">Shoulder Season</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1 h-1 bg-muted/40 rounded-full" />
          <span className="text-[0.62rem] tracking-widest uppercase text-muted font-sans">Weekend Rate</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-transparent border border-mist" />
          <span className="text-[0.62rem] tracking-widest uppercase text-muted font-sans">Base Rate</span>
        </div>
      </div>
    </div>
  );
}
