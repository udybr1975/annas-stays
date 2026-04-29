import { useState, useEffect } from "react";
import Calendar from "./Calendar";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import { supabase } from "../lib/supabase";
import { resolveImageUrl } from "../lib/imageUtils";
import { Info, RefreshCw } from "lucide-react";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/autoplay";

interface BookingModalProps {
  listing: any;
  onClose: () => void;
}

export default function BookingModal({ listing, onClose }: BookingModalProps) {
  const [step, setStep] = useState(1);
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [car, setCar] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [form, setForm] = useState({ fn: "", ln: "", em: "", message: "" });
  const [specialPrices, setSpecialPrices] = useState<any[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [guestCount, setGuestCount] = useState<number>(0);
  const [isInstantBook, setIsInstantBook] = useState<boolean>(true);

  useEffect(() => {
    fetchSpecialPrices();
    fetchBookedDates();
    fetchInstantBookStatus();
  }, [listing.id, refreshTrigger]);

  const fetchInstantBookStatus = async () => {
    const { data, error } = await supabase
      .from("apartments")
      .select("is_instant_book")
      .eq("id", listing.id)
      .single();
    if (!error && data) {
      setIsInstantBook(data.is_instant_book !== false);
    }
  };

  const fetchBookedDates = async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("check_in, check_out, status, payment_link_expires_at")
      .eq("apartment_id", listi
