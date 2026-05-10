import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { LISTINGS as FALLBACK_LISTINGS } from "../constants";
import { motion, AnimatePresence } from "motion/react";
import { resolveImageUrl } from "../lib/imageUtils";
import { Save, LogOut, RefreshCw, Upload, X as CloseIcon, Loader2, Check, Calendar as CalendarIcon, Plus, Trash2, TrendingUp, Lock, Unlock, Edit3, Sparkles, Menu } from "lucide-react";
import { GoogleGenAI } from "@google/genai";
import ExecutiveView from "./ExecutiveView";

interface AdminDashboardProps {
  onClose: () => void;
}

export default function AdminDashboard({ onClose }: AdminDashboardProps) {
  const [apartments, setApartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string, index: number } | null>(null);
  const [saveAllStatus, setSaveAllStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [activeTab, setActiveTab] = useState<"listings" | "pricing" | "reservations" | "knowledge" | "ugcposts">("reservations");
  const [knowledgeBase, setKnowledgeBase] = useState<any[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [knowledgeForm, setKnowledgeForm] = useState({ category: "", content: "", is_private: false });
  const [aiEvents, setAiEvents] = useState<any[]>([]);
  const [searchingEvents, setSearchingEvents] = useState(false);
  const [specialPrices, setSpecialPrices] = useState<any[]>([]);
  const [allSpecialPrices, setAllSpecialPrices] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedApartmentId, setSelectedApartmentId] = useState<string | null>(null);
  const [tempPrices, setTempPrices] = useState<{ [key: string]: number }>({});
  const [eventPrices, setEventPrices] = useState<{ [key: string]: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState({
    high: { start: "", end: "", weekday: "", weekend: "" },
    shoulder: { start: "", end: "", weekday: "", weekend: "" },
    low: { start: "", end: "", weekday: "", weekend: "" }
  });
  const [previewDate, setPreviewDate] = useState(new Date().toISOString().split('T')[0]);
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newListing, setNewListing] = useState({
    name: "",
    description: "",
    neighborhood: "",
    price_per_night: "",
    image_url: "",
    is_instant_book: true
  });
  const [isAdding, setIsAdding] = useState(false);

  const [ugcSubmissions, setUgcSubmissions] = useState<any[]>([]);
  const [ugcLoading, setUgcLoading] = useState(false);
  const [approvingUgc, setApprovingUgc] = useState<string | null>(null);

  // ── Mobile burger menu state ───────────────────────────────────────────────
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const ADMIN_EMAIL = "udy.bar.yosef@gmail.com";

  useEffect(() => {
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && session.user.email === ADMIN_EMAIL) {
        setUser(session.user);
        fetchApartments();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (otp.length === 6 && showOtpInput) {
      verifyOtp();
    }
  }, [otp, showOtpInput]);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.email === ADMIN_EMAIL) {
      setUser(user);
      fetchApartments();
    } else {
      setLoading(false);
    }
  };

  const login = async () => {
    if (email !== ADMIN_EMAIL) {
      showToast("Access denied. Only the admin can access this dashboard.", "error");
      return;
    }
    setAuthLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      showToast(error.message, "error");
    } else {
      setShowOtpInput(true);
      setMessage("A 6-digit code has been sent to your email.");
    }
    setAuthLoading(false);
  };

  const verifyOtp = async () => {
    setAuthLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'signup' });
    if (error) {
      const { data: data2, error: error2 } = await supabase.auth.verifyOtp({ email, token: otp, type: 'magiclink' });
      if (error2) {
        showToast(error2.message, "error");
      } else if (data2.user) {
        setUser(data2.user);
        fetchApartments();
      }
    } else if (data.user) {
      setUser(data.user);
      fetchApartments();
    }
    setAuthLoading(false);
  };

  const fetchApartments = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from("apartments").select("*").order("id");
    if (error) {
      console.error("Error fetching listings:", error);
      if (error.message.includes("JWT") || error.message.includes("permission")) {
        setError("Please Login to Edit (Session Expired or Permission Denied)");
      } else {
        setError("Error fetching listings: " + error.message);
      }
      setApartments(FALLBACK_LISTINGS);
    } else if (data && data.length > 0) {
      const mapped = data.map(l => {
        const fallback = FALLBACK_LISTINGS.find(f => String(f.id) === String(l.id));
        const images = l.images || [];
        return {
          ...l,
          min: Number(l.min || fallback?.min || 1),
          imgs: images.length > 0 ? images : (fallback?.imgs || []),
          tags: l.tags || fallback?.tags || []
        };
      });
      setApartments(mapped);
      if (!selectedApartmentId) setSelectedApartmentId(mapped[0].id);
    } else {
      setApartments(FALLBACK_LISTINGS);
      if (!selectedApartmentId) setSelectedApartmentId(FALLBACK_LISTINGS[0].id);
    }
    setLoading(false);
    fetchBookings();
    fetchAllSpecialPrices();
  };

  const fetchAllSpecialPrices = async () => {
    const { data, error } = await supabase.from("apartment_prices").select("*");
    if (error) {
      console.error("Error fetching all special prices:", error);
    } else {
      setAllSpecialPrices(data || []);
    }
  };

  const fetchBookings = async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*, guests(*)")
      .order("check_in", { ascending: false });
    if (error) {
      console.error("Error fetching bookings:", error);
    } else {
      setBookings(data || []);
    }
  };

useEffect(() => {
    if (user) {
      const channel = supabase
        .channel('bookings_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
          fetchBookings();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  const updateBookingStatus = async (id: string, status: string) => {
    if (status === 'confirmed') {
      showToast("Approving and sending payment link...", "info");
      try {
        const response = await fetch('/api/approve-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: id }),
        });
        const result = await response.json();
        if (!response.ok) {
          showToast(`Error: ${result.error || 'Could not approve booking'}`, "error");
          return;
        }
        showToast("Approved — payment link sent to guest", "success");
        setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'awaiting_payment', admin_needs_attention: false } : b));
      } catch (err: any) {
        showToast(`Unexpected error: ${err.message}`, "error");
      }
    } else if (status === 'resend_payment_link') {
      showToast("Sending a new payment link...", "info");
      try {
        const response = await fetch('/api/approve-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: id }),
        });
        const result = await response.json();
        if (!response.ok) {
          showToast(`Error: ${result.error || 'Could not resend payment link'}`, "error");
          return;
        }
        showToast("New payment link sent to guest", "success");
        fetchBookings();
      } catch (err: any) {
        showToast(`Unexpected error: ${err.message}`, "error");
      }
     } else {
      showToast("Declining reservation request...", "info");
      try {
        const response = await fetch('/api/decline-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: id }),
        });
        const result = await response.json();
        if (!response.ok) {
          showToast(`Error: ${result.error || 'Could not decline booking'}`, "error");
          return;
        }
        showToast("Reservation declined — guest notified", "success");
        setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'declined', admin_needs_attention: false } : b));
      } catch (err: any) {
        showToast(`Unexpected error: ${err.message}`, "error");
      }
    }
  };

const deleteBooking = async (id: string) => {
    showToast("Cancelling reservation...", "info");
    try {
      const response = await fetch('/api/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: id }),
      });
      const result = await response.json();
      if (!response.ok) {
        showToast(`Error: ${result.error || 'Could not cancel booking'}`, "error");
        return;
      }
      showToast("Reservation cancelled — guest notified by email", "success");
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled', cancelled_at: new Date().toISOString(), admin_needs_attention: false } : b));
    } catch (err: any) {
      showToast(`Unexpected error: ${err.message}`, "error");
    }
  };

  const fetchSpecialPrices = async () => {
    if (!selectedApartmentId) return;
    const { data, error } = await supabase.from("apartment_prices").select("*").eq("apartment_id", selectedApartmentId);
    if (error) {
      console.error("Error fetching special prices:", error);
    } else {
      setSpecialPrices(data || []);
    }
  };

  useEffect(() => {
    if (selectedApartmentId) {
      if (activeTab === "pricing") {
        fetchSpecialPrices();
        searchHelsinkiEvents();
      } else if (activeTab === "knowledge") {
        fetchKnowledgeBase();
      } else if (activeTab === "ugcposts") {
        fetchUgcSubmissions();
      }
    }
  }, [activeTab, selectedApartmentId]);

  const fetchKnowledgeBase = async () => {
    if (!selectedApartmentId) return;
    setKnowledgeLoading(true);
    const { data, error } = await supabase
      .from("apartment_details")
      .select("*")
      .eq("apartment_id", selectedApartmentId)
      .order("created_at", { ascending: false });
    if (error) { console.error("Error fetching knowledge base:", error); }
    else { setKnowledgeBase(data || []); }
    setKnowledgeLoading(false);
  };

  const fetchUgcSubmissions = async () => {
    setUgcLoading(true);
    const { data, error } = await supabase
      .from('ugc_submissions')
      .select('*, bookings(reference_number, check_in, check_out, apartments(name)), guests(first_name, last_name, email)')
      .order('created_at', { ascending: false });
    if (error) { console.error('[AdminDashboard] fetchUgcSubmissions error:', error.message); }
    else { setUgcSubmissions(data || []); }
    setUgcLoading(false);
  };

  const handleApproveUgc = async (submissionId: string) => {
    setApprovingUgc(submissionId);
    try {
      const res = await fetch('/api/approve-ugc-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || 'Failed to approve refund', 'error'); return; }
      showToast('Refund approved — EUR ' + Number(result.refundAmount).toFixed(2) + ' issued via Stripe', 'success');
      setUgcSubmissions(prev => prev.map(s => s.id === submissionId ? { ...s, status: 'approved', approved_at: new Date().toISOString() } : s));
    } catch (err: any) {
      showToast('Unexpected error: ' + err.message, 'error');
    } finally {
      setApprovingUgc(null);
    }
  };

  const handleRejectUgc = async (submissionId: string) => {
    const { error } = await supabase
      .from('ugc_submissions')
      .update({ status: 'rejected' })
      .eq('id', submissionId);
    if (error) { showToast('Failed to reject: ' + error.message, 'error'); return; }
    showToast('Submission rejected', 'success');
    setUgcSubmissions(prev => prev.map(s => s.id === submissionId ? { ...s, status: 'rejected' } : s));
  };

  const handleSaveKnowledge = async () => {
    if (!user) return showToast("Please login first.", "error");
    if (!selectedApartmentId) return showToast("Please select an apartment first.", "error");
    if (!knowledgeForm.category || !knowledgeForm.content) return showToast("Please fill in all fields.", "error");
    setKnowledgeLoading(true);
    const payload = { apartment_id: selectedApartmentId, category: knowledgeForm.category.trim(), content: knowledgeForm.content.trim(), is_private: knowledgeForm.is_private };
    try {
      let error;
      if (editingKnowledgeId) {
        const { error: e } = await supabase.from("apartment_details").update(payload).eq("id", editingKnowledgeId);
        error = e;
      } else {
        const { error: e } = await supabase.from("apartment_details").insert(payload);
        error = e;
      }
      if (error) { showToast("Error saving knowledge: " + error.message, "error"); }
      else {
        showToast("Knowledge item saved", "success");
        setKnowledgeForm({ category: "", content: "", is_private: false });
        setEditingKnowledgeId(null);
        await fetchKnowledgeBase();
      }
    } catch (err: any) {
      showToast("An unexpected error occurred: " + err.message, "error");
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const deleteKnowledge = async (id: string) => {
    if (!id) { showToast("DELETE ERROR: Missing Item ID", "error"); return; }
    showToast("Deleting...", "info");
    setKnowledgeLoading(true);
    try {
      const { error } = await supabase.from("apartment_details").delete().eq("id", id);
      if (error) { showToast(`DELETE ERROR: ${error.message}`, "error"); }
      else {
        showToast("Deleted!", "success");
        setKnowledgeBase(prev => prev.filter(item => item.id !== id));
        await fetchKnowledgeBase();
      }
    } catch (err: any) {
      showToast(`DELETE ERROR: ${err.message}`, "error");
    } finally {
      setKnowledgeLoading(false);
    }
  };

  const handleBulkImport = async () => {
    if (!selectedApartmentId) return showToast("Please select an apartment first.", "error");
    if (!bulkImportText.trim()) return;
    setIsBulkImporting(true);
    setKnowledgeLoading(true);
    showToast("Processing with AI...", "info");
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Split these apartment rules into a JSON array with 'category', 'content', 'is_private' (boolean). is_private=true for WiFi passwords, door codes, or sensitive info.\n\n${bulkImportText}`,
        config: { responseMimeType: "application/json" }
      });
      const suggestions = JSON.parse(response.text || "[]");
      if (Array.isArray(suggestions)) {
        const keywords = ['password', 'code', 'key', 'entrance'];
        const processed = suggestions.map(s => ({
          ...s,
          is_private: keywords.some(kw => (s.content || "").toLowerCase().includes(kw)) || s.is_private,
          apartment_id: selectedApartmentId
        }));
        const { error } = await supabase.from("apartment_details").insert(processed);
        if (error) { showToast("Bulk import failed: " + error.message, "error"); }
        else {
          showToast(`Imported ${processed.length} items.`, "success");
          setBulkImportText("");
          await fetchKnowledgeBase();
        }
      }
    } catch (err: any) {
      showToast("Bulk import failed: " + err.message, "error");
    } finally {
      setIsBulkImporting(false);
      setKnowledgeLoading(false);
    }
  };

  const searchHelsinkiEvents = async () => {
    setSearchingEvents(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Find major events in Helsinki 2026. Prioritize: Lux Helsinki (Jan 6-11), Vappu (Apr 30-May 1), Midsummer (Jun 19-20), Tuska Festival (Jun 26-28), Helsinki Cup (Jul 6-11), Flow Festival (Aug 14-16), Helsinki Design Week (Aug 28-Sep 6), Slush (Nov 18-19). Return a JSON array of objects with 'name', 'start', 'end'.",
        config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
      });
      setAiEvents(JSON.parse(response.text || "[]"));
    } catch (err) {
      setAiEvents([
        { name: "Lux Helsinki", start: "2026-01-06", end: "2026-01-11" },
        { name: "Vappu", start: "2026-04-30", end: "2026-05-01" },
        { name: "Midsummer (Juhannus)", start: "2026-06-19", end: "2026-06-20" },
        { name: "Tuska Festival", start: "2026-06-26", end: "2026-06-28" },
        { name: "Helsinki Cup", start: "2026-07-06", end: "2026-07-11" },
        { name: "Flow Festival", start: "2026-08-14", end: "2026-08-16" },
        { name: "Helsinki Design Week", start: "2026-08-28", end: "2026-09-06" },
        { name: "Slush", start: "2026-11-18", end: "2026-11-19" }
      ]);
    }
    setSearchingEvents(false);
  };

  const handleSaveSeason = async (type: 'high' | 'shoulder' | 'low') => {
    if (!user) { showToast("Please Login to Edit (Not Authenticated)", "error"); return; }
    if (!selectedApartmentId) return;
    const season = seasonForm[type];
    if (!season.start || !season.end || !season.weekday || !season.weekend) {
      showToast("Please fill in all fields for the " + type + " season.", "error"); return;
    }
    const { error } = await supabase.from("apartment_prices").insert({
      apartment_id: selectedApartmentId,
      event_name: type.charAt(0).toUpperCase() + type.slice(1) + " Season",
      start_date: season.start, end_date: season.end,
      price_override: Number(season.weekday),
      weekend_price_override: Number(season.weekend),
      pricing_type: 'season'
    });
    if (error) { showToast("Error saving season: " + error.message, "error"); }
    else {
      showToast(type.charAt(0).toUpperCase() + type.slice(1) + " season saved", "success");
      fetchSpecialPrices();
      setSeasonForm(prev => ({ ...prev, [type]: { start: "", end: "", weekday: "", weekend: "" } }));
    }
  };

  const getPriceForDate = (dateStr: string) => {
    const apt = apartments.find(a => a.id === selectedApartmentId);
    if (!apt) return { price: 0, type: "N/A" };
    const date = new Date(dateStr); date.setHours(0, 0, 0, 0);
    const special = specialPrices.find(p => {
      if (p.pricing_type === 'season') return false;
      const start = new Date(p.start_date || p.date); start.setHours(0, 0, 0, 0);
      const end = new Date(p.end_date || p.date); end.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    });
    if (special) return { price: special.price_override || special.price, type: "Event: " + (special.event_name || "Special Pricing") };
    const season = specialPrices.find(p => {
      if (p.pricing_type !== 'season') return false;
      const start = new Date(p.start_date); start.setHours(0, 0, 0, 0);
      const end = new Date(p.end_date); end.setHours(0, 0, 0, 0);
      return date >= start && date <= end;
    });
    if (season) {
      const day = date.getDay(); const isWeekend = day === 5 || day === 6;
      return { price: isWeekend ? (season.weekend_price_override || season.price_override) : season.price_override, type: season.event_name + (isWeekend ? " (Weekend)" : " (Weekday)") };
    }
    return { price: apt.price_per_night || apt.price || 0, type: "Base Rate" };
  };

  const handleSetEventPrice = async (event: any, price: string) => {
    if (!user) { showToast("Please Login to Edit (Not Authenticated)", "error"); return; }
    if (!price || isNaN(Number(price))) { showToast("Please enter a valid price", "error"); return; }
    if (!selectedApartmentId) return;
    const { error } = await supabase.from('apartment_prices').insert({
      apartment_id: selectedApartmentId, event_name: event.name,
      start_date: event.start, end_date: event.end, price_override: Number(price)
    });
    if (error) { showToast("Error: " + error.message, "error"); }
    else {
      showToast("Event price set", "success");
      setEventPrices(prev => { const next = { ...prev }; delete next[event.name]; return next; });
      fetchSpecialPrices();
    }
  };

  const saveWeekendPrice = async () => {
    if (!user) { showToast("Please Login to Edit (Not Authenticated)", "error"); return; }
    if (!selectedApartmentId) return;
    const l = apartments.find(apt => apt.id === selectedApartmentId);
    if (!l) return;
    const myValue = tempPrices[`${l.id}-weekend`] ?? l.weekend_pricing_value;
    const { error } = await supabase.from('apartments').update({ weekend_pricing_value: Number(myValue) }).eq('id', selectedApartmentId);
    if (error) { showToast("Error saving: " + error.message, "error"); }
    else {
      showToast('Save Successful!', "success");
      setApartments(prev => prev.map(item => item.id === selectedApartmentId ? { ...item, weekend_pricing_value: Number(myValue) } : item));
    }
  };

  const deleteSpecialPrice = async (id: number) => {
    if (!user) { showToast("Please Login to Edit (Not Authenticated)", "error"); return; }
    const { error } = await supabase.from("apartment_prices").delete().eq("id", id);
    if (error) { showToast("Error deleting price: " + error.message, "error"); }
    else { showToast("Price rule deleted", "success"); fetchSpecialPrices(); }
  };

  const seedData = async () => {
    setLoading(true);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) { showToast("Auth session error: Please ensure you are logged in correctly.", "error"); setLoading(false); return; }
    const { error } = await supabase.from("apartments").upsert(
      FALLBACK_LISTINGS.map(l => ({
        id: l.id, name: l.name, description: l.desc, price_per_night: l.price,
        neighborhood: l.neigh, size: l.size, guests: l.guests, min: l.min,
        tags: l.tags, cleaning_fee: l.cleaningFee, images: l.imgs || [],
        rating: l.rating, weekend_pricing_enabled: false, weekend_pricing_type: 'percentage', weekend_pricing_value: 0
      }))
    );
    if (error) { showToast("Error initializing listings: " + error.message, "error"); }
    else { showToast("Listings initialized successfully!", "success"); fetchApartments(); }
    setLoading(false);
  };

  const updateListing = (id: string, updates: any) => {
    const uiUpdates = { ...updates };
    if (updates.images) uiUpdates.imgs = updates.images;
    if (updates.neighborhood) uiUpdates.neigh = updates.neighborhood;
    if (updates.price_per_night) uiUpdates.price = updates.price_per_night;
    if (updates.cleaning_fee) uiUpdates.cleaningFee = updates.cleaning_fee;
    if (updates.description) uiUpdates.desc = updates.description;
    setApartments(prev => prev.map(l => l.id === id ? { ...l, ...uiUpdates } : l));
  };

  const saveField = async (id: string, field: string, value: any) => {
    let finalValue = value;
    if (field === 'min') { const num = parseInt(String(value).replace(/\D/g, '')); finalValue = isNaN(num) || num < 1 ? 1 : num; }
    if (['price_per_night', 'cleaning_fee', 'weekend_pricing_value', 'rating'].includes(field)) finalValue = Number(value) || 0;
    if (['weekend_pricing_enabled', 'is_instant_book'].includes(field)) finalValue = Boolean(value);
    updateListing(id, { [field]: finalValue });
    const { error } = await supabase.from('apartments').update({ [field]: finalValue }).eq('id', id);
    if (!error) {
      const key = `${id}-${field}`;
      setSavedFields(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setSavedFields(prev => ({ ...prev, [key]: false })), 2000);
    }
  };

  const handleFileUpload = async (id: string, files: FileList | null) => {
    if (!user) { showToast("Please Login to Edit (Not Authenticated)", "error"); return; }
    if (!files || files.length === 0) return;
    const listing = apartments.find(l => l.id === id);
    const currentImages = listing?.images || listing?.imgs || [];
    if (currentImages.length + files.length > 10) { showToast("Maximum 10 images allowed per listing.", "error"); return; }
    setUploading(id);
    showToast("Uploading images...", "info");
    const newImageUrls = [...(currentImages || [])];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split('.').pop();
      const fileName = `${id}-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('apartment-images').upload(fileName, file, { contentType: file.type, upsert: true });
      if (uploadError) { showToast("Error uploading image: " + uploadError.message, "error"); continue; }
      const { data: { publicUrl } } = supabase.storage.from('apartment-images').getPublicUrl(fileName);
      newImageUrls.push(`${publicUrl}?t=${Date.now()}`);
    }
    await updateListing(id, { images: newImageUrls });
    setUploading(null);
  };

  const removeImage = (id: string, index: number) => {
    setDeleting({ id, index });
    const listing = apartments.find(l => l.id === id);
    const currentImages = [...(listing?.images || listing?.imgs || [])];
    currentImages.splice(index, 1);
    updateListing(id, { images: currentImages });
    setDeleting(null);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    onClose();
  };

  const handleAddListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return showToast("Please login first.", "error");
    if (!newListing.name || !newListing.neighborhood || !newListing.price_per_night) return showToast("Please fill in all required fields.", "error");
    setIsAdding(true);
    try {
      const id = crypto.randomUUID();
      const { error } = await supabase.from("apartments").insert({
        id, name: newListing.name.trim(), description: newListing.description.trim(),
        neighborhood: newListing.neighborhood.trim(), price_per_night: Number(newListing.price_per_night),
        images: newListing.image_url ? [newListing.image_url] : [],
        guests: 2, min: 1, cleaning_fee: 0, rating: 5.0, size: "30m²",
        tags: ["New Listing"], is_instant_book: newListing.is_instant_book
      });
      if (error) { showToast("Error adding listing: " + error.message, "error"); }
      else {
        showToast("Listing added successfully!", "success");
        setShowAddModal(false);
        setNewListing({ name: "", description: "", neighborhood: "", price_per_night: "", image_url: "", is_instant_book: true });
        await fetchApartments();
      }
    } catch (err: any) {
      showToast("An unexpected error occurred: " + err.message, "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleNewListingImageUpload = async (file: File) => {
    if (!user) return;
    showToast("Uploading image...", "info");
    const fileExt = file.name.split('.').pop();
    const fileName = `new-${Date.now()}-${Math.floor(Math.random() * 1000)}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('apartment-images').upload(fileName, file, { contentType: file.type, upsert: true });
    if (uploadError) { showToast("Error uploading image: " + uploadError.message, "error"); return; }
    const { data: { publicUrl } } = supabase.storage.from('apartment-images').getPublicUrl(fileName);
    setNewListing(prev => ({ ...prev, image_url: publicUrl }));
    showToast("Image uploaded!", "success");
  };

  const saveAllChanges = async () => {
    if (!user) { showToast("Please Login to Edit (Not Authenticated)", "error"); return; }
    setSaveAllStatus("saving");
    showToast("Saving all changes...", "info");
    const dataToSave = apartments.map(l => ({
      id: l.id, name: l.name, description: l.description || l.desc,
      price_per_night: Number(l.price_per_night || l.price) || 0,
      neighborhood: l.neighborhood || l.neigh, size: l.size, guests: l.guests,
      min: Math.round(Number(l.min)) || 1, tags: l.tags,
      cleaning_fee: Number(l.cleaning_fee || l.cleaningFee) || 0,
      images: (l.images || l.imgs || []).map((url: string) => url.includes("?t=") ? url : `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`),
      rating: Number(l.rating) || 0,
      weekend_pricing_enabled: Boolean(l.weekend_pricing_enabled),
      weekend_pricing_type: l.weekend_pricing_type || 'percentage',
      weekend_pricing_value: Number(l.weekend_pricing_value) || 0
    }));
    const { error } = await supabase.from("apartments").upsert(dataToSave);
    if (error) { showToast("Error saving all changes: " + error.message, "error"); setSaveAllStatus("idle"); }
    else {
      showToast("All changes saved!", "success");
      setSaveAllStatus("saved");
      await fetchApartments();
      setTimeout(() => setSaveAllStatus("idle"), 2000);
    }
  };

  // ── Loading / auth screens ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 bg-warm-white z-[2000] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin text-clay mx-auto mb-4" size={40} />
          <p className="font-serif text-xl">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-charcoal z-[2000] flex items-center justify-center p-6">
        <div className="bg-warm-white p-8 md:p-12 max-w-[400px] w-full shadow-2xl">
          <h2 className="font-serif text-3xl font-light mb-6 text-center">Admin Access</h2>
          <div className="flex flex-col gap-4">
            {!showOtpInput ? (
              <>
                <input type="email" placeholder="Admin Email" value={email} onChange={e => setEmail(e.target.value)} className="bg-cream border border-mist p-3 font-sans text-sm outline-none" />
                {message && <p className="text-forest text-[0.7rem] font-medium text-center">{message}</p>}
                <button onClick={login} disabled={authLoading} className="bg-forest text-white p-3 font-sans text-xs tracking-widest uppercase cursor-pointer hover:bg-forest/90 transition-colors disabled:opacity-50">
                  {authLoading ? "Sending code..." : "Send OTP Code"}
                </button>
              </>
            ) : (
              <>
                <div className="text-center mb-2">
                  <p className="text-muted text-[0.7rem] uppercase tracking-widest mb-1">Enter 6-digit code</p>
                  <p className="text-charcoal text-xs font-medium">{email}</p>
                </div>
                <input type="text" inputMode="numeric" placeholder="000000" maxLength={6} value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="bg-cream border border-mist p-3 font-sans text-center text-lg tracking-[0.5em] outline-none" />
                {message && <p className="text-forest text-[0.7rem] font-medium text-center">{message}</p>}
                <button onClick={verifyOtp} disabled={authLoading || otp.length !== 6} className="bg-forest text-white p-3 font-sans text-xs tracking-widest uppercase cursor-pointer hover:bg-forest/90 transition-colors disabled:opacity-50">
                  {authLoading ? "Verifying..." : "Verify Code"}
                </button>
                <button onClick={() => setShowOtpInput(false)} className="text-muted text-[0.6rem] uppercase tracking-widest hover:text-charcoal transition-colors">Change Email</button>
              </>
            )}
            <button onClick={onClose} className="text-muted text-[0.7rem] uppercase tracking-widest mt-2 hover:text-charcoal transition-colors">Back to site</button>
          </div>
        </div>
      </div>
    );
  }

  if (!apartments || apartments.length === 0) {
    return (
      <div className="fixed inset-0 bg-warm-white z-[2000] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin text-clay mx-auto mb-4" size={40} />
          <p className="font-serif text-xl">Loading...</p>
        </div>
      </div>
    );
  }

  const TABS = [
    { key: "reservations", label: "Bookings & Agenda" },
    { key: "listings",     label: "Apartments" },
    { key: "pricing",      label: "Special Pricing" },
    { key: "knowledge",    label: "Knowledge Base" },
    { key: "ugcposts",     label: "Guest Posts" },
  ] as const;

  return (
    <div className="fixed inset-0 bg-warm-white z-[2000] overflow-y-auto overflow-x-hidden p-3 md:p-12">

      {/* ── Mobile burger menu drawer ──────────────────────────────────────── */}
      <AnimatePresence>
        {showMobileMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowMobileMenu(false)}
              className="fixed inset-0 bg-charcoal/50 z-[3100] md:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-white z-[3200] md:hidden flex flex-col shadow-2xl"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-mist">
                <h2 className="font-serif text-xl font-light">Menu</h2>
                <button onClick={() => setShowMobileMenu(false)} className="p-2 text-muted hover:text-charcoal">
                  <CloseIcon size={20} />
                </button>
              </div>

              {/* Nav items */}
              <div className="flex-1 overflow-y-auto py-4">
                <p className="px-6 text-[0.55rem] uppercase tracking-widest text-muted font-bold mb-2">Navigate</p>
                {TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setShowMobileMenu(false); }}
                    className={`w-full text-left px-6 py-4 text-sm font-sans border-l-4 transition-all ${
                      activeTab === tab.key
                        ? "border-charcoal text-charcoal font-bold bg-cream/40"
                        : "border-transparent text-muted hover:bg-cream/20"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}

                <div className="mx-6 my-4 border-t border-mist" />
                <p className="px-6 text-[0.55rem] uppercase tracking-widest text-muted font-bold mb-2">Actions</p>

                <button
                  onClick={() => { saveAllChanges(); setShowMobileMenu(false); }}
                  disabled={saveAllStatus !== "idle"}
                  className="w-full text-left px-6 py-4 text-sm font-sans text-muted hover:bg-cream/20 flex items-center gap-3 disabled:opacity-50"
                >
                  <Save size={16} className="text-charcoal" />
                  {saveAllStatus === "saving" ? "Saving..." : saveAllStatus === "saved" ? "Saved!" : "Save All Changes"}
                </button>

                <button
                  onClick={() => { seedData(); setShowMobileMenu(false); }}
                  className="w-full text-left px-6 py-4 text-sm font-sans text-muted hover:bg-cream/20 flex items-center gap-3"
                >
                  <RefreshCw size={16} className="text-charcoal" />
                  Initialize Listings
                </button>
              </div>

              {/* Drawer footer — logout */}
              <div className="p-6 border-t border-mist">
                <button
                  onClick={() => { logout(); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-clay text-white font-sans text-[0.7rem] tracking-widest uppercase hover:bg-clay/90 transition-colors"
                >
                  <LogOut size={16} /> Logout
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="max-w-[1200px] mx-auto">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 md:mb-8 border-b border-mist pb-4 md:pb-6 gap-4 md:gap-6">
          <div className="w-full lg:w-auto">
            <div className="flex justify-between items-center mb-2 lg:mb-0">
              <div className="flex items-center gap-3">
                {/* Burger button — mobile only */}
                <button
                  onClick={() => setShowMobileMenu(true)}
                  className="md:hidden p-2.5 bg-charcoal text-white rounded-sm active:bg-charcoal/80 transition-colors"
                  aria-label="Open menu"
                >
                  <Menu size={20} />
                </button>
                <h1 className="font-serif text-2xl md:text-4xl font-light">Admin Dashboard</h1>
              </div>
              <button onClick={onClose} className="lg:hidden p-2 text-muted hover:text-charcoal">
                <CloseIcon size={20} />
              </button>
            </div>

            {error && (
              <div className="mt-2 p-2 bg-clay/10 border border-clay text-clay text-xs font-medium flex items-center gap-2">
                <CloseIcon size={14} /> {error}
              </div>
            )}

            {/* Desktop tabs */}
            <div className="hidden md:flex gap-6 mt-6">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`text-[0.7rem] tracking-[0.2em] uppercase font-sans pb-1 border-b-2 transition-all whitespace-nowrap ${activeTab === tab.key ? "text-charcoal border-charcoal" : "text-muted border-transparent"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mobile: show current tab name as breadcrumb */}
            <div className="md:hidden mt-3">
              <p className="text-[0.6rem] uppercase tracking-widest text-muted font-bold">
                {TABS.find(t => t.key === activeTab)?.label}
              </p>
            </div>
          </div>

          {/* Desktop action buttons */}
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={saveAllChanges}
              disabled={saveAllStatus !== "idle"}
              className={`flex items-center justify-center gap-2 p-2.5 px-6 font-sans text-[0.7rem] tracking-widest uppercase transition-all duration-300 border ${saveAllStatus === "saved" ? "bg-forest text-white border-forest" : "bg-charcoal text-white border-charcoal hover:bg-charcoal/90"} disabled:opacity-80`}
            >
              {saveAllStatus === "saving" ? <><RefreshCw size={14} className="animate-spin" /> Saving</> : saveAllStatus === "saved" ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save All</>}
            </button>
            <button onClick={seedData} className="flex items-center gap-2 bg-cream text-charcoal border border-mist p-2.5 px-4 font-sans text-[0.7rem] tracking-widest uppercase hover:bg-mist transition-colors">
              <RefreshCw size={14} /> Init
            </button>
            <button onClick={logout} className="flex items-center gap-2 bg-clay text-white p-2.5 px-4 font-sans text-[0.7rem] tracking-widest uppercase hover:bg-clay/90 transition-colors">
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>

        {/* ── Tab content ─────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-20"><RefreshCw className="animate-spin text-clay" size={40} /></div>

        ) : activeTab === "listings" ? (
          <div className="grid grid-cols-1 gap-12">
            <button onClick={() => setShowAddModal(true)} className="bg-cream/20 border-2 border-dashed border-mist p-12 flex flex-col items-center justify-center gap-4 hover:bg-cream/40 transition-all group">
              <div className="w-16 h-16 rounded-full bg-mist/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus size={32} className="text-clay" />
              </div>
              <div className="text-center">
                <h3 className="font-serif text-xl font-light mb-1">Add New Listing</h3>
                <p className="text-[0.65rem] tracking-widest uppercase text-muted font-sans">Create a new apartment entry</p>
              </div>
            </button>

            {apartments?.map(l => (
              <div key={l.id} className="bg-cream/30 border border-mist p-8 grid grid-cols-1 xl:grid-cols-[1.5fr_2fr] gap-10">
                <div className="flex flex-col gap-4">
                  <label className="text-[0.6rem] tracking-widest uppercase text-muted font-sans">Gallery ({(l.imgs || []).length} / 15)</label>
                  <div className="relative">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto p-1 border border-mist/30 bg-warm-white/50">
                      {(l.imgs || []).map((img: string, idx: number) => (
                        <div key={idx} className="relative aspect-square group">
                          <img src={resolveImageUrl(img)} alt={`${l.name} ${idx}`} className="w-full h-full object-cover border border-mist" />
                          <button onClick={() => removeImage(l.id, idx)} disabled={deleting?.id === l.id && deleting?.index === idx}
                            className="absolute top-1 right-1 bg-charcoal/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100">
                            {deleting?.id === l.id && deleting?.index === idx ? <Loader2 size={10} className="animate-spin" /> : <CloseIcon size={12} />}
                          </button>
                        </div>
                      ))}
                      {(l.imgs || []).length < 15 && (
                        <label className="aspect-square border-2 border-dashed border-mist flex flex-col items-center justify-center cursor-pointer hover:bg-mist/20 transition-colors">
                          {uploading === l.id ? <Loader2 className="animate-spin text-clay" size={20} /> : <><Upload size={16} className="text-muted mb-1" /><span className="text-[0.5rem] uppercase tracking-widest text-muted">Add</span></>}
                          <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileUpload(l.id, e.target.files)} disabled={uploading === l.id} />
                        </label>
                      )}
                    </div>
                    {uploading === l.id && (
                      <div className="absolute inset-0 bg-warm-white/60 backdrop-blur-[1px] flex flex-col items-center justify-center z-10">
                        <RefreshCw className="animate-spin text-clay mb-2" size={24} />
                        <span className="text-[0.6rem] uppercase tracking-widest text-charcoal font-medium">Refreshing Gallery...</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-6">
                  <div className="bg-cream/50 p-6 border border-mist/50 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><TrendingUp size={16} className="text-clay" /><h3 className="font-serif text-lg font-light">Weekend Pricing</h3></div>
                      <div className="flex items-center gap-4">
                        {l.weekend_pricing_enabled && (
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Type:</span>
                              <select value={l.weekend_pricing_type || 'percentage'} onChange={e => updateListing(l.id, { weekend_pricing_type: e.target.value })} className="bg-warm-white border border-mist p-1 font-sans text-xs outline-none focus:border-clay">
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed">Fixed Amount (€)</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Value:</span>
                              <input type="number" value={tempPrices[`${l.id}-weekend-listings`] ?? (l.weekend_pricing_value || 0)}
                                onChange={e => setTempPrices(prev => ({ ...prev, [`${l.id}-weekend-listings`]: parseFloat(e.target.value) }))}
                                onBlur={e => { updateListing(l.id, { weekend_pricing_value: parseFloat(e.target.value) }); setTempPrices(prev => { const next = { ...prev }; delete next[`${l.id}-weekend-listings`]; return next; }); }}
                                className="bg-warm-white border border-mist p-1 px-2 font-sans text-xs outline-none w-20 focus:border-clay" placeholder="100" />
                            </div>
                          </div>
                        )}
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={l.weekend_pricing_enabled || false} onChange={e => updateListing(l.id, { weekend_pricing_enabled: e.target.checked })} />
                          <div className="w-11 h-6 bg-mist peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-forest"></div>
                        </label>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-mist/30 flex items-center justify-between">
                      <div className="flex items-center gap-2"><Sparkles size={16} className="text-clay" /><h3 className="font-serif text-lg font-light">Instant Booking</h3></div>
                      <div className="flex items-center gap-3">
                        <span className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">{l.is_instant_book ? "Enabled" : "Requires Approval"}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={l.is_instant_book ?? true} onChange={e => saveField(l.id, 'is_instant_book', e.target.checked)} />
                          <div className="w-11 h-6 bg-mist peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-forest"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[
                      { label: "Apartment Name", field: "name", defaultVal: l.name },
                      { label: "Neighborhood", field: "neighborhood", defaultVal: l.neighborhood || l.neigh },
                      { label: "Price per night (€)", field: "price_per_night", type: "number", defaultVal: l.price_per_night || l.price },
                      { label: "Cleaning Fee (€)", field: "cleaning_fee", type: "number", defaultVal: l.cleaning_fee || l.cleaningFee },
                      { label: "Guests", field: "guests", type: "number", defaultVal: l.guests },
                      { label: "Size (e.g. 25 m²)", field: "size", defaultVal: l.size },
                      { label: "Rating (e.g. ★ 4.8)", field: "rating", defaultVal: l.rating },
                      { label: "Tags (comma separated)", field: "tags", defaultVal: l.tags?.join(", ") },
                    ].map(f => (
                      <div key={f.field} className="flex flex-col gap-1">
                        <label className="text-[0.6rem] tracking-widest uppercase text-muted font-sans">{f.label}</label>
                        <input type={f.type || "text"} defaultValue={f.defaultVal}
                          onBlur={e => {
                            if (f.field === "tags") { updateListing(l.id, { tags: e.target.value.split(",").map(t => t.trim()).filter(Boolean) }); }
                            else { updateListing(l.id, { [f.field]: e.target.value }); }
                          }}
                          className="bg-warm-white border border-mist p-3 font-sans text-sm outline-none focus:border-clay" />
                      </div>
                    ))}
                    <div className="flex flex-col gap-1">
                      <label className="text-[0.6rem] tracking-widest uppercase text-muted font-sans flex items-center justify-between">
                        Min Stay (Nights) {savedFields[`${l.id}-min`] && <span className="text-forest text-[0.5rem] animate-pulse">● Saved</span>}
                      </label>
                      <input type="number" min="1" value={l.min || ""} onChange={e => updateListing(l.id, { min: e.target.value })} onBlur={e => saveField(l.id, 'min', e.target.value)}
                        className={`bg-warm-white border p-3 font-sans text-sm outline-none transition-all duration-500 ${savedFields[`${l.id}-min`] ? "border-forest shadow-[0_0_10px_rgba(61,79,62,0.2)]" : "border-mist focus:border-clay"}`} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.6rem] tracking-widest uppercase text-muted font-sans">Description</label>
                    <textarea rows={4} defaultValue={l.description || l.desc} onBlur={e => updateListing(l.id, { description: e.target.value })}
                      className="bg-warm-white border border-mist p-3 font-sans text-sm outline-none resize-none focus:border-clay" />
                  </div>
                </div>
              </div>
            ))}
          </div>

        ) : activeTab === "pricing" ? (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4 bg-cream p-6 border border-mist">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <label className="text-[0.7rem] tracking-widest uppercase text-muted font-sans">Select Apartment:</label>
                  <select value={selectedApartmentId || ""} onChange={e => setSelectedApartmentId(e.target.value)} className="bg-warm-white border border-mist p-2 font-sans text-sm outline-none min-w-[200px]">
                    {apartments?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 text-muted"><CalendarIcon size={16} /><span className="text-xs uppercase tracking-widest">Helsinki 2026 Season</span></div>
              </div>
              {selectedApartmentId && (() => {
                const l = apartments.find(apt => apt.id === selectedApartmentId);
                if (!l) return null;
                return (
                  <div className="pt-4 border-t border-mist/30 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Base Price</span>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-serif">€</span>
                          <input type="number" value={tempPrices[`${l.id}-base`] ?? (l.price_per_night || l.price || 0)}
                            onChange={e => setTempPrices(prev => ({ ...prev, [`${l.id}-base`]: parseInt(e.target.value) }))}
                            onBlur={e => { updateListing(l.id, { price_per_night: parseInt(e.target.value) }); setTempPrices(prev => { const next = { ...prev }; delete next[`${l.id}-base`]; return next; }); }}
                            className="bg-transparent border-b border-mist/50 w-16 text-sm outline-none focus:border-clay" />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Weekend Price</span>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-serif">€</span>
                          <input type="number" value={tempPrices[`${l.id}-weekend`] ?? (l.weekend_pricing_value || 0)}
                            onChange={e => setTempPrices(prev => ({ ...prev, [`${l.id}-weekend`]: parseFloat(e.target.value) }))}
                            disabled={!l.weekend_pricing_enabled}
                            className={`bg-transparent border-b border-mist/50 w-16 text-sm outline-none focus:border-clay ${!l.weekend_pricing_enabled ? 'opacity-30' : ''}`} />
                          <button onClick={saveWeekendPrice} disabled={!l.weekend_pricing_enabled} className="text-[0.6rem] bg-forest text-white px-3 py-1 uppercase tracking-widest hover:bg-forest/90 transition-colors ml-2 disabled:opacity-50">Save</button>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Weekend Pricing</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={l.weekend_pricing_enabled || false} onChange={e => updateListing(l.id, { weekend_pricing_enabled: e.target.checked })} />
                        <div className="w-10 h-5 bg-mist peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-forest"></div>
                      </label>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-10">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-serif text-xl font-light">AI Event Discovery</h3>
                  {searchingEvents && <RefreshCw className="animate-spin text-clay" size={16} />}
                </div>
                <div className="bg-warm-white border border-mist overflow-hidden">
                  {searchingEvents ? (
                    <div className="p-12 text-center"><Loader2 className="animate-spin text-clay mx-auto mb-4" size={32} /><p className="text-xs uppercase tracking-widest text-muted">Scanning Helsinki 2026...</p></div>
                  ) : (
                    <div className="divide-y divide-mist">
                      {aiEvents?.map((ev, idx) => {
                        const existing = specialPrices?.find(p => p.event_name === ev.name);
                        const currentPrice = eventPrices[ev.name] || "";
                        return (
                          <div key={idx} className="p-4 hover:bg-cream/50 transition-colors">
                            <div className="flex justify-between items-center mb-2">
                              <div>
                                <h4 className="font-serif text-lg font-light">{ev.name}</h4>
                                <p className="text-[0.65rem] text-muted uppercase tracking-widest">{ev.start} — {ev.end}</p>
                              </div>
                              {existing ? (
                                <div className="bg-forest/10 text-forest text-[0.6rem] px-2 py-1 uppercase tracking-widest font-medium">€{existing.price_override || existing.price} Set</div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1 bg-warm-white border border-mist px-2 py-1">
                                    <span className="text-[0.6rem] text-muted">€</span>
                                    <input type="number" placeholder="Price" value={currentPrice} onChange={e => setEventPrices(prev => ({ ...prev, [ev.name]: e.target.value }))} className="bg-transparent w-16 text-xs outline-none font-sans" />
                                  </div>
                                  <button onClick={() => handleSetEventPrice(ev, currentPrice)} className="bg-charcoal text-white p-1.5 hover:bg-charcoal/80 transition-colors"><Save size={14} /></button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <h3 className="font-serif text-xl font-light">Active Special Pricing</h3>
                <div className="bg-warm-white border border-mist overflow-hidden">
                  {(specialPrices?.length || 0) === 0 ? (
                    <div className="p-12 text-center text-muted italic text-sm">No special prices set for this apartment.</div>
                  ) : (
                    <div className="max-h-[600px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-cream sticky top-0 z-10">
                          <tr>
                            {["Dates", "Type / Event", "Price", ""].map(h => <th key={h} className="p-4 text-[0.6rem] uppercase tracking-widest text-muted border-b border-mist">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-mist">
                          {specialPrices?.map(p => (
                            <tr key={p.id} className="hover:bg-cream/30 transition-colors">
                              <td className="p-4 text-sm font-light">{p.start_date === p.end_date ? (p.start_date || p.date) : `${p.start_date || p.date} — ${p.end_date || p.date}`}</td>
                              <td className="p-4 text-sm font-light">
                                <div className="flex flex-col"><span>{p.event_name || "Manual Adjustment"}</span>{p.pricing_type === 'season' && <span className="text-[0.6rem] text-muted uppercase tracking-widest">Seasonal Pricing</span>}</div>
                              </td>
                              <td className="p-4 text-sm font-medium text-forest">
                                {p.pricing_type === 'season' ? <div className="flex flex-col"><span>€{p.price_override} (Wkdy)</span><span>€{p.weekend_price_override} (Wknd)</span></div> : `€${p.price_override || p.price}`}
                              </td>
                              <td className="p-4 text-right"><button onClick={() => deleteSpecialPrice(p.id)} className="text-clay hover:text-clay/80 transition-colors"><Trash2 size={14} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="mt-8 flex flex-col gap-6">
                  <h3 className="font-serif text-xl font-light">Seasonal Pricing Manager</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {(['high', 'shoulder', 'low'] as const).map(season => (
                      <div key={season} className="bg-warm-white border border-mist p-5 flex flex-col gap-4">
                        <h4 className="text-[0.7rem] uppercase tracking-widest text-clay font-sans font-bold">{season} Season</h4>
                        <div className="grid grid-cols-2 gap-3">
                          {[['Start', 'start'], ['End', 'end']].map(([label, key]) => (
                            <div key={key} className="flex flex-col gap-1">
                              <label className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">{label}</label>
                              <input type="date" value={seasonForm[season][key as 'start'|'end']} onChange={e => setSeasonForm(prev => ({ ...prev, [season]: { ...prev[season], [key]: e.target.value } }))} className="bg-cream border border-mist p-2 text-xs outline-none" />
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[['Weekday €', 'weekday'], ['Weekend €', 'weekend']].map(([label, key]) => (
                            <div key={key} className="flex flex-col gap-1">
                              <label className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">{label}</label>
                              <input type="number" placeholder="Price" value={seasonForm[season][key as 'weekday'|'weekend']} onChange={e => setSeasonForm(prev => ({ ...prev, [season]: { ...prev[season], [key]: e.target.value } }))} className="bg-cream border border-mist p-2 text-xs outline-none" />
                            </div>
                          ))}
                        </div>
                        <button onClick={() => handleSaveSeason(season)} className="bg-forest text-white p-2 text-[0.6rem] uppercase tracking-widest hover:bg-forest/90 transition-colors mt-2">Save {season} Season</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-8 bg-cream p-6 border border-mist">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-serif text-xl font-light">Admin Price Preview</h3>
                    <div className="flex items-center gap-3">
                      <label className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Test Date:</label>
                      <input type="date" value={previewDate} onChange={e => setPreviewDate(e.target.value)} className="bg-warm-white border border-mist p-2 text-xs outline-none" />
                    </div>
                  </div>
                  {(() => {
                    const { price, type } = getPriceForDate(previewDate);
                    return (
                      <div className="flex items-center gap-8">
                        <div className="flex flex-col"><span className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Calculated Price</span><span className="font-serif text-3xl text-forest">€{price}</span></div>
                        <div className="flex flex-col"><span className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Applied Rule</span><span className="text-sm font-medium text-charcoal">{type}</span></div>
                        <div className="ml-auto text-[0.65rem] text-muted italic max-w-[200px]">This preview uses the priority hierarchy: Events &gt; Seasons &gt; Base Price.</div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

        ) : activeTab === "knowledge" ? (
          <div className="flex flex-col gap-8">
            <div className="bg-cream/30 border border-mist p-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                <div>
                  <h2 className="font-serif text-2xl font-light mb-2">Apartment Knowledge Base</h2>
                  <p className="text-muted text-sm italic">Manage private instructions and public information for the chatbot.</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[0.6rem] uppercase tracking-widest text-muted font-sans font-bold">Select Apartment:</label>
                  <select value={selectedApartmentId || ""} onChange={e => setSelectedApartmentId(e.target.value)} className="bg-white border border-mist p-2 px-4 font-sans text-xs outline-none focus:border-clay">
                    {apartments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8">
                <div className="bg-white p-6 border border-mist flex flex-col gap-5 h-fit sticky top-6">
                  <h3 className="text-[0.7rem] uppercase tracking-widest text-charcoal font-bold flex items-center gap-2">
                    {editingKnowledgeId ? <Edit3 size={14} /> : <Plus size={14} />}
                    {editingKnowledgeId ? "Edit Item" : "Add New Item"}
                  </h3>
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Category</label>
                    <input placeholder="e.g. WiFi, Check-in, Parking" value={knowledgeForm.category} onChange={e => setKnowledgeForm(p => ({ ...p, category: e.target.value }))} className="bg-cream/30 border border-mist p-3 text-sm outline-none focus:border-clay" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[0.6rem] uppercase tracking-widest text-muted font-sans">Content</label>
                    <textarea rows={4} placeholder="Enter the instructions or information..." value={knowledgeForm.content} onChange={e => setKnowledgeForm(p => ({ ...p, content: e.target.value }))} className="bg-cream/30 border border-mist p-3 text-sm outline-none focus:border-clay resize-none" />
                  </div>
                  <div className="flex items-center justify-between bg-cream/20 p-3 border border-mist/50">
                    <div className="flex items-center gap-2">
                      {knowledgeForm.is_private ? <Lock size={14} className="text-clay" /> : <Unlock size={14} className="text-sage" />}
                      <span className="text-[0.65rem] uppercase tracking-widest font-sans font-bold">Private Info</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={knowledgeForm.is_private} onChange={e => setKnowledgeForm(p => ({ ...p, is_private: e.target.checked }))} />
                      <div className="w-10 h-5 bg-mist peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-clay"></div>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSaveKnowledge} disabled={knowledgeLoading} className="flex-1 bg-charcoal text-white p-3 text-[0.65rem] uppercase tracking-widest font-bold hover:bg-charcoal/90 transition-colors disabled:opacity-50">
                      {editingKnowledgeId ? "Update Item" : "Save Item"}
                    </button>
                    {editingKnowledgeId && (
                      <button onClick={() => { setEditingKnowledgeId(null); setKnowledgeForm({ category: "", content: "", is_private: false }); }} className="bg-mist text-charcoal p-3 text-[0.65rem] uppercase tracking-widest font-bold hover:bg-mist/80 transition-colors">Cancel</button>
                    )}
                  </div>
                  <div className="mt-6 pt-6 border-t border-mist">
                    <h3 className="text-[0.7rem] uppercase tracking-widest text-charcoal font-bold flex items-center gap-2 mb-4"><Sparkles size={14} className="text-clay" /> Bulk Import</h3>
                    <p className="text-[0.6rem] text-muted mb-3 italic">Paste your rules below. AI will categorize them for you.</p>
                    <textarea rows={5} placeholder="WiFi: Pass123&#10;Check-in: Key is under the mat&#10;Sauna: Available 24/7" value={bulkImportText} onChange={e => setBulkImportText(e.target.value)} className="w-full bg-cream/30 border border-mist p-3 text-[0.7rem] outline-none focus:border-clay mb-3" />
                    <button onClick={handleBulkImport} disabled={isBulkImporting || !bulkImportText.trim()} className="w-full bg-forest text-white p-3 text-[0.65rem] uppercase tracking-widest font-bold hover:bg-forest/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {isBulkImporting ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />} AI Bulk Import
                    </button>
                  </div>
                </div>
                <div className="bg-white border border-mist overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-mist/30 border-b border-mist">
                          {["Category", "Content", "Status", "Actions"].map(h => <th key={h} className="p-4 text-[0.65rem] uppercase tracking-widest text-muted font-bold">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-mist">
                        {knowledgeLoading && knowledgeBase.length === 0 ? (
                          <tr><td colSpan={4} className="p-10 text-center text-muted italic">Loading...</td></tr>
                        ) : knowledgeBase.length === 0 ? (
                          <tr><td colSpan={4} className="p-10 text-center text-muted italic">No knowledge base items found for this apartment.</td></tr>
                        ) : knowledgeBase.map(item => (
                          <tr key={item.id} className={`hover:bg-cream/10 transition-colors ${item.is_private ? "bg-clay/5" : ""}`}>
                            <td className="p-4"><span className="text-[0.7rem] font-bold uppercase tracking-widest text-charcoal">{item.category}</span></td>
                            <td className="p-4"><p className="text-[0.75rem] text-muted leading-relaxed max-w-md">{item.content}</p></td>
                            <td className="p-4">
                              {item.is_private
                                ? <div className="flex items-center gap-1.5 text-clay text-[0.6rem] font-bold uppercase tracking-widest"><Lock size={12} /> Private</div>
                                : <div className="flex items-center gap-1.5 text-sage text-[0.6rem] font-bold uppercase tracking-widest"><Unlock size={12} /> Public</div>}
                            </td>
                            <td className="p-4">
                              <div className="flex gap-2">
                                <button onClick={e => { e.stopPropagation(); setEditingKnowledgeId(item.id); setKnowledgeForm({ category: item.category, content: item.content, is_private: item.is_private }); }} disabled={knowledgeLoading} className="p-2 text-charcoal hover:bg-mist rounded transition-all disabled:opacity-50 relative z-10"><Edit3 size={14} className="pointer-events-none" /></button>
                                <button onClick={e => { e.stopPropagation(); deleteKnowledge(item.id); }} disabled={knowledgeLoading} className="p-2 text-clay hover:bg-clay/10 rounded transition-all disabled:opacity-50 relative z-10"><Trash2 size={14} className="pointer-events-none" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

        ) : activeTab === "reservations" ? (
          <ExecutiveView
            bookings={bookings}
            apartments={apartments}
            onCancelBooking={deleteBooking}
            onUpdateBookingStatus={updateBookingStatus}
            specialPrices={allSpecialPrices}
          />

        ) : activeTab === "ugcposts" ? (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-light">Guest Instagram Posts</h2>
              <button
                onClick={fetchUgcSubmissions}
                disabled={ugcLoading}
                className="flex items-center gap-2 bg-cream text-charcoal border border-mist p-2.5 px-4 font-sans text-[0.7rem] tracking-widest uppercase hover:bg-mist transition-colors"
              >
                <RefreshCw size={14} className={ugcLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            {ugcLoading ? (
              <div className="flex justify-center py-20"><RefreshCw className="animate-spin text-clay" size={40} /></div>
            ) : ugcSubmissions.length === 0 ? (
              <div className="text-center py-20 text-muted italic text-sm">No UGC submissions yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {ugcSubmissions.map(s => {
                  const bk = s.bookings as any;
                  const gt = s.guests as any;
                  const apt = bk?.apartments as any;
                  return (
                    <div key={s.id} className="bg-white border border-mist overflow-hidden flex flex-col">
                      {s.post_url ? (
                        <div className="p-4 border-b border-mist shrink-0">
                          <a
                            href={s.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 text-[0.6rem] uppercase tracking-widest font-bold text-white no-underline"
                            style={{ background: 'linear-gradient(135deg,#9333ea,#ec4899,#f97316)' }}
                          >
                            View Instagram Post
                          </a>
                        </div>
                      ) : s.screenshot_url ? (
                        <a href={s.screenshot_url} target="_blank" rel="noopener noreferrer" className="block shrink-0">
                          <img src={s.screenshot_url} alt="UGC screenshot" className="w-full object-cover" style={{ maxHeight: '220px', objectFit: 'cover' }} />
                        </a>
                      ) : null}
                      <div className="p-5 flex flex-col gap-3 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-serif text-base font-light">{gt?.first_name} {gt?.last_name}</p>
                            <p className="text-[0.65rem] text-muted uppercase tracking-widest">{apt?.name || 'Unknown apartment'}</p>
                          </div>
                          {s.status === 'approved' && (
                            <span className="text-[0.6rem] font-bold uppercase tracking-widest text-white bg-forest px-2.5 py-1 shrink-0">Approved</span>
                          )}
                          {s.status === 'pending' && (
                            <span className="text-[0.6rem] font-bold uppercase tracking-widest text-amber-800 bg-amber-100 px-2.5 py-1 shrink-0">Pending</span>
                          )}
                          {s.status === 'rejected' && (
                            <span className="text-[0.6rem] font-bold uppercase tracking-widest text-muted line-through px-2.5 py-1 shrink-0">Rejected</span>
                          )}
                        </div>
                        <div className="text-[0.7rem] text-muted space-y-1">
                          <p>Ref: #{bk?.reference_number || '—'}</p>
                          <p>Check-in: {bk?.check_in || '—'}</p>
                          <p>Email: {gt?.email || '—'}</p>
                          <p className="font-medium text-charcoal">Refund: EUR {parseFloat(s.refund_amount).toFixed(2)}</p>
                          <p>Submitted: {new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                        {s.status === 'approved' && s.approved_at && (
                          <p className="text-[0.65rem] text-forest">Approved on {new Date(s.approved_at).toLocaleDateString()}</p>
                        )}
                        {s.status === 'pending' && (
                          <div className="flex gap-2 mt-auto pt-3 border-t border-mist">
                            <button
                              onClick={() => handleApproveUgc(s.id)}
                              disabled={!!approvingUgc}
                              className="flex-1 p-2.5 text-white text-[0.6rem] tracking-widest uppercase font-sans font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                              style={{ background: '#2d6a4f' }}
                            >
                              {approvingUgc === s.id ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectUgc(s.id)}
                              disabled={!!approvingUgc}
                              className="flex-1 p-2.5 text-white text-[0.6rem] tracking-widest uppercase font-sans font-bold transition-colors disabled:opacity-50"
                              style={{ background: '#9d4a3c' }}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        ) : null}

        {/* Toast */}
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-8 right-8 p-4 px-6 shadow-2xl z-[3000] font-sans text-xs tracking-widest uppercase flex items-center gap-3 border ${toast.type === 'success' ? 'bg-forest text-white border-forest' : toast.type === 'error' ? 'bg-clay text-white border-clay' : 'bg-charcoal text-white border-charcoal'}`}
          >
            {toast.type === 'success' && <Check size={16} />}
            {toast.type === 'error' && <CloseIcon size={16} />}
            {toast.type === 'info' && <RefreshCw size={16} className="animate-spin" />}
            {toast.message}
          </motion.div>
        )}

        {/* Add New Listing Modal */}
        <AnimatePresence>
          {showAddModal && (
            <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm" onClick={() => !isAdding && setShowAddModal(false)} />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-2xl bg-warm-white p-8 md:p-12 border border-mist shadow-2xl overflow-y-auto max-h-[90vh]">
                <button onClick={() => setShowAddModal(false)} className="absolute top-6 right-6 text-muted hover:text-charcoal transition-colors"><CloseIcon size={24} /></button>
                <div className="mb-8">
                  <h2 className="font-serif text-3xl font-light mb-2">Add New Listing</h2>
                  <p className="text-muted text-sm italic">Fill in the details to create a new apartment entry.</p>
                </div>
                <form onSubmit={handleAddListing} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2">
                      <label className="text-[0.65rem] tracking-widest uppercase text-muted font-sans font-bold">Apartment Name *</label>
                      <input required value={newListing.name} onChange={e => setNewListing(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. The Nordic Sanctuary" className="bg-cream border border-mist p-4 font-sans text-sm outline-none focus:border-clay" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[0.65rem] tracking-widest uppercase text-muted font-sans font-bold">Location / Neighborhood *</label>
                      <input required value={newListing.neighborhood} onChange={e => setNewListing(prev => ({ ...prev, neighborhood: e.target.value }))} placeholder="e.g. Punavuori" className="bg-cream border border-mist p-4 font-sans text-sm outline-none focus:border-clay" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[0.65rem] tracking-widest uppercase text-muted font-sans font-bold">Description</label>
                    <textarea rows={4} value={newListing.description} onChange={e => setNewListing(prev => ({ ...prev, description: e.target.value }))} placeholder="Describe the unique features of this apartment..." className="bg-cream border border-mist p-4 font-sans text-sm outline-none focus:border-clay resize-none" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2">
                      <label className="text-[0.65rem] tracking-widest uppercase text-muted font-sans font-bold">Price Per Night (€) *</label>
                      <input required type="number" value={newListing.price_per_night} onChange={e => setNewListing(prev => ({ ...prev, price_per_night: e.target.value }))} placeholder="150" className="bg-cream border border-mist p-4 font-sans text-sm outline-none focus:border-clay" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[0.65rem] tracking-widest uppercase text-muted font-sans font-bold">Booking Type</label>
                      <div className="flex items-center justify-between bg-cream border border-mist p-3.5 h-[50px]">
                        <span className="text-xs text-muted font-sans italic">{newListing.is_instant_book ? "Instant Booking" : "Requires Approval"}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={newListing.is_instant_book} onChange={e => setNewListing(prev => ({ ...prev, is_instant_book: e.target.checked }))} />
                          <div className="w-10 h-5 bg-mist peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-forest"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[0.65rem] tracking-widest uppercase text-muted font-sans font-bold">Cover Image</label>
                    <div className="flex gap-4">
                      <label className="flex-1 bg-cream border border-mist p-4 font-sans text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-mist/10 transition-colors">
                        <Upload size={18} className="text-clay" />
                        <span className="text-muted uppercase tracking-widest text-[0.6rem]">Upload Image</span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleNewListingImageUpload(e.target.files[0])} />
                      </label>
                      {newListing.image_url && (
                        <div className="w-14 h-14 border border-mist relative">
                          <img src={resolveImageUrl(newListing.image_url)} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => setNewListing(prev => ({ ...prev, image_url: "" }))} className="absolute -top-2 -right-2 bg-charcoal text-white rounded-full p-0.5"><CloseIcon size={12} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pt-6 flex gap-4">
                    <button type="button" onClick={() => setShowAddModal(false)} disabled={isAdding} className="flex-1 border border-mist p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-mist/10 transition-all disabled:opacity-50">Cancel</button>
                    <button type="submit" disabled={isAdding} className="flex-1 bg-charcoal text-white p-4 font-sans text-[0.7rem] tracking-[0.2em] uppercase hover:bg-charcoal/90 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
                      {isAdding ? <><RefreshCw size={14} className="animate-spin" /> Adding...</> : <><Plus size={14} /> Create Listing</>}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
