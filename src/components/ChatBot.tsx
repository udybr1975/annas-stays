import React, { useState, useRef, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { LISTINGS } from "../constants";
import { supabase } from "../lib/supabase";
import { Lock, Unlock, Send, RefreshCw, ExternalLink } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  text: string;
}

export default function ChatBot({ 
  initialBooking, 
  initialListing,
  listings = [],
  onBookNow 
}: { 
  initialBooking?: any; 
  initialListing?: any;
  listings?: any[];
  onBookNow?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Message[]>([
    { role: "assistant", text: "Hei! Welcome to Anna's Stays. I'm here to help with your stay or any Helsinki tips. What's on your mind?" }
  ]);
  const [history, setHistory] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [selectedAptId, setSelectedAptId] = useState<string | null>(null);
  const [suggestedCategories, setSuggestedCategories] = useState<string[]>([]);
  const [internalListings, setInternalListings] = useState<any[]>([]);
  const [verifiedBooking, setVerifiedBooking] = useState<any>(initialBooking || null);
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [verifyForm, setVerifyForm] = useState({ email: "", ref: "" });
  const [verifyError, setVerifyError] = useState("");

  const idMap: Record<string, string> = {
    "1": "959da37c-ea29-4d34-b007-6fc299f5eed8", 
    "2": "53747ce3-557c-46ca-b3b9-bf499146af6e", 
    "3": "9d9330dd-ffd6-4f7e-a293-4423c0d3dde4"
  };

  const getDbUuid = (id: string | null) => {
    if (!id) return null;
    return idMap[id] || id;
  };

  useEffect(() => {
    const fetchAllListings = async () => {
      if (listings.length > 0) {
        setInternalListings(listings);
        return;
      }
      const { data } = await supabase.from("apartments").select("*").order("id");
      if (data) {
        const mapped = data.map(l => {
          const fallback = LISTINGS.find(f => String(f.id) === String(l.id));
          return {
            ...l,
            neigh: l.neighborhood || l.neigh,
            price: l.price_per_night || l.price,
            desc: l.description || l.desc,
            imgs: l.images || (fallback?.imgs || []),
            cleaningFee: l.cleaning_fee || l.cleaningFee,
            minStay: Number(l.min || fallback?.min || 1),
            tags: l.tags || fallback?.tags || []
          };
        });
        setInternalListings(mapped);
      } else {
        setInternalListings(LISTINGS);
      }
    };
    fetchAllListings();
  }, [listings]);

  useEffect(() => {
    if (initialBooking) {
      setVerifiedBooking(initialBooking);
      setSelectedAptId(String(initialBooking.apartment_id));
    } else if (initialListing) {
      setSelectedAptId(String(initialListing.id));
    }
  }, [initialBooking, initialListing]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  useEffect(() => {
    setSuggestedCategories(verifiedBooking ? ["Wifi", "House rules"] : ["Policies", "Check-in"]);
  }, [selectedAptId, verifiedBooking]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, guests!inner(email), apartments(*)')
        .eq('reference_number', verifyForm.ref.trim().toUpperCase())
        .eq('guests.email', verifyForm.email.trim().toLowerCase())
        .single();

      if (error || !data) {
        setVerifyError("Booking not found.");
      } else {
        setVerifiedBooking(data);
        setSelectedAptId(String(data.apartment_id));
        setShowVerifyForm(false);
      }
    } catch (err) {
      setVerifyError("Error.");
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const txt = input.trim();
    setInput("");
    setMsgs(p => [...p, { role: "user", text: txt }]);
    setLoading(true);

    const apiKey = "AIzaSyBQKHNsImtU_efF6N2bheZdKIw6y9E69i0";
    const genAI = new GoogleGenAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
      const result = await model.generateContent(txt);
      const response = await result.response;
      const reply = response.text().replace(/\*\*/g, "");
      
      setMsgs(p => [...p, { role: "assistant", text: reply }]);
    } catch (e) {
      setMsgs(p => [...p, { role: "assistant", text: "I'm having a connection issue. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-sans">
      <button onClick={() => setOpen(!open)} className="fixed bottom-[90px] right-7 bg-forest text-white w-12 h-12 rounded-full z-[999] shadow-lg flex items-center justify-center hover:scale-105 transition-transform">
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="fixed bottom-[150px] right-7 w-[340px] h-[500px] bg-warm-white border border-mist z-[999] flex flex-col shadow-2xl rounded-sm overflow-hidden">
          <div className="bg-forest text-cream p-3 flex justify-between items-center font-bold uppercase text-[0.7rem] tracking-widest">
            <span>Anna's Assistant</span>
            {verifiedBooking ? (
              <span className="bg-sage/20 px-2 py-1 rounded flex items-center gap-1"><Unlock size={10}/> Verified</span>
            ) : (
              <button onClick={() => setShowVerifyForm(!showVerifyForm)} className="border border-cream/30 px-2 py-1 rounded hover:bg-cream/10 flex items-center gap-1"><Lock size={10}/> Verify Stay</button>
            )}
          </div>

          {showVerifyForm && (
            <form onSubmit={handleVerify} className="p-4 bg-cream border-b border-mist space-y-2">
              <input type="email" placeholder="Email" required value={verifyForm.email} onChange={e => setVerifyForm({...verifyForm, email: e.target.value})} className="w-full p-2 text-xs border border-mist outline-none" />
              <input type="text" placeholder="Reference" required value={verifyForm.ref} onChange={e => setVerifyForm({...verifyForm, ref: e.target.value})} className="w-full p-2 text-xs border border-mist outline-none" />
              <button type="submit" className="w-full bg-forest text-white p-2 text-[0.6rem] font-bold uppercase">Verify</button>
            </form>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.map((m, i) => (
              <div key={i} className={`p-3 text-sm leading-relaxed flex flex-col ${m.role === "user" ? "bg-forest text-white self-end rounded-l-lg rounded-tr-lg ml-8" : "bg-cream text-charcoal self-start rounded-r-lg rounded-tl-lg border border-mist mr-8"}`}>
                <span>{m.text}</span>
              </div>
            ))}
            {loading && <div className="text-[0.7rem] italic text-muted">Anna is typing...</div>}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-mist bg-white flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask me anything..." className="flex-1 p-2 text-sm border border-mist outline-none bg-cream/20" />
            <button onClick={send} className="bg-forest text-white px-3 py-2 rounded-sm">
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
