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

  // UUID Mapping from your Supabase Table
  const idMap: Record<string, string> = {
    "1": "959da37c-ea29-4d34-b007-6fc299f5eed8", 
    "2": "53747ce3-557c-46ca-b3b9-bf499146af6e", 
    "3": "9d9330dd-ffd6-4f7e-a293-4423c0d3dde4"
  };

  const getDbUuid = (id: string | null) => {
    if (!id) return null;
    return idMap[id] || id;
  };

  const getShortId = (id: string | null) => {
    if (!id) return null;
    const reverseMap: Record<string, string> = Object.fromEntries(Object.entries(idMap).map(([k, v]) => [v, k]));
    return reverseMap[id] || id;
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
          const images = l.images || [];
          return {
            ...l,
            neigh: l.neighborhood || l.neigh,
            price: l.price_per_night || l.price,
            desc: l.description || l.desc,
            imgs: images.length > 0 ? images : (fallback?.imgs || []),
            cleaningFee: l.cleaning_fee || l.cleaningFee,
            minStay: Number(l.min || fallback?.min || 1),
            min: Number(l.min || fallback?.min || 1),
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

  // CATEGORY BUBBLES: Fetch based on selection and verification status
  useEffect(() => {
    const fetchCategories = async () => {
      if (!selectedAptId) {
        setSuggestedCategories([]);
        return;
      }

      const dbUuid = getDbUuid(selectedAptId);
      const shortId = getShortId(selectedAptId);
      const allListings = internalListings.length > 0 ? internalListings : (listings.length > 0 ? listings : LISTINGS);
      
      // Robust find: try selectedAptId, then dbUuid, then shortId
      let activeApt = allListings.find(l => 
        String(l.id) === String(selectedAptId) || 
        String(l.id) === String(dbUuid) || 
        String(l.id) === String(shortId)
      );

      // Fallback: if still not found but we have a verified booking name
      if (!activeApt && verifiedBooking?.apartments?.name) {
        activeApt = allListings.find(l => l.name === verifiedBooking.apartments.name);
      }
      
      if (!activeApt) {
        console.log("ChatBot: No activeApt found for bubbles. selectedAptId:", selectedAptId);
        return;
      }

      const fixedPublic = [
        "Kitchen and cooking",
        "Policies",
        "Internet",
        "Check-in",
        "Check-out",
        "Location info",
        "Amenities"
      ];

      const fixedVerified = [
        "Checkin instructions",
        "Wifi",
        "House rules",
        "Address",
        "Directions"
      ];

      const baseSet = verifiedBooking ? fixedVerified : fixedPublic;

      try {
        // Resolve the real ID from the DB - Double check by UUID then Name
        let realId = activeApt.id;
        
        const { data: dbApt } = await supabase
          .from("apartments")
          .select("id")
          .eq("id", activeApt.id)
          .single();
          
        if (!dbApt) {
          // Try by name as fallback
          const { data: dbAptByName } = await supabase
            .from("apartments")
            .select("id")
            .ilike("name", activeApt.name)
            .single();
          if (dbAptByName) realId = dbAptByName.id;
        } else {
          realId = dbApt.id;
        }

        let { data } = await supabase
          .from("apartment_details")
          .select("category, is_private")
          .eq("apartment_id", realId);

        // Fallback
        if ((!data || data.length === 0) && realId !== dbUuid && dbUuid) {
          const { data: d2 } = await supabase.from("apartment_details").select("category, is_private").eq("apartment_id", dbUuid);
          if (d2) data = d2;
        }

        if (data) {
          const dynamic = Array.from(new Set(
            data
              .filter(d => verifiedBooking || !d.is_private)
              .map(d => d.category)
          )).filter(c => 
            c.toLowerCase() !== 'greeting' && 
            !baseSet.some(f => f.toLowerCase() === c.toLowerCase())
          );
          
          // Combine fixed and dynamic, limit to 7 total
          setSuggestedCategories([...baseSet, ...dynamic].slice(0, 7));
        } else {
          setSuggestedCategories(baseSet);
        }
      } catch (err) { 
        console.error("Category Fetch Error:", err);
        setSuggestedCategories(baseSet);
      }
    };
    fetchCategories();
  }, [selectedAptId, verifiedBooking, listings, internalListings]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, guests!inner(email), apartments(*)')
        .eq('reference_number', verifyForm.ref.trim().toUpperCase())
        .eq('guests.email', verifyForm.email.trim().toLowerCase())
        .not('status', 'in', '("cancelled","declined")')
        .single();

      if (error || !data) {
        setVerifyError("Booking not found.");
      } else {
        setVerifiedBooking(data);
        setSelectedAptId(String(data.apartment_id));
        setShowVerifyForm(false);
        setMsgs(p => [...p, { role: "assistant", text: `Verified! I'm ready to help with your stay at ${data.apartments.name}.` }]);
      }
    } catch (err) {
      setVerifyError("Verification error.");
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

    const activeDbUuid = getDbUuid(selectedAptId);
    const reverseMap: Record<string, string> = Object.fromEntries(Object.entries(idMap).map(([k, v]) => [v, k]));
    const shortId = activeDbUuid ? (reverseMap[activeDbUuid] || activeDbUuid) : selectedAptId;
    const allListings = internalListings.length > 0 ? internalListings : (listings.length > 0 ? listings : LISTINGS);
    
    // Robust find: try selectedAptId, then activeDbUuid, then shortId
    let activeApt = allListings.find(l => 
      String(l.id) === String(selectedAptId) || 
      String(l.id) === String(activeDbUuid) || 
      String(l.id) === String(shortId)
    );

    // Double check by name if we have a verified booking but activeApt is still missing
    if (!activeApt && verifiedBooking?.apartments?.name) {
      activeApt = allListings.find(l => l.name === verifiedBooking.apartments.name);
    }

    let tableData = "";
    try {
      if (activeApt) {
        console.log("ChatBot: Active Apt found:", activeApt.name, "ID:", activeApt.id);
        
        // Resolve the real ID from the DB - Double check by UUID then Name
        let realId = activeApt.id;
        
        const { data: dbApt } = await supabase
          .from("apartments")
          .select("id")
          .eq("id", activeApt.id)
          .single();
          
        if (!dbApt) {
          // Try by name as fallback
          const { data: dbAptByName } = await supabase
            .from("apartments")
            .select("id")
            .ilike("name", activeApt.name)
            .single();
          if (dbAptByName) realId = dbAptByName.id;
        } else {
          realId = dbApt.id;
        }

        console.log("ChatBot: Resolved realId for details:", realId);
        
        // Fetch details using the resolved ID
        let { data, error } = await supabase
          .from("apartment_details")
          .select("*")
          .eq("apartment_id", realId);
          
        // Fallback: If nothing found, try the other ID formats
        if ((!data || data.length === 0) && realId !== activeDbUuid && activeDbUuid) {
          const { data: d2 } = await supabase.from("apartment_details").select("*").eq("apartment_id", activeDbUuid);
          if (d2 && d2.length > 0) data = d2;
        }
        if ((!data || data.length === 0) && realId !== shortId && shortId) {
          const { data: d3 } = await supabase.from("apartment_details").select("*").eq("apartment_id", shortId);
          if (d3 && d3.length > 0) data = d3;
        }

        // Final fallback: If still no data, try matching by name directly in the content
        if (!data || data.length === 0) {
          const { data: d4 } = await supabase
            .from("apartment_details")
            .select("*")
            .ilike("content", `%${activeApt.name}%`); 
          if (d4 && d4.length > 0) data = d4;
        }

        if (data && data.length > 0) {
          console.log(`ChatBot: Found ${data.length} knowledge items.`);
          // For unverified guests, we only show public data. For verified, we show everything.
          const filteredData = verifiedBooking ? data : data.filter(d => !d.is_private);
          tableData = filteredData.map(d => `[Category: ${d.category}] [Private: ${d.is_private}] ${d.content}`).join("\n");
        } else {
          console.log("ChatBot: No knowledge items found in DB.");
        }
      }
    } catch (err) { console.error("Fetch Error:", err); }

    const systemInstruction = `You are Anna's assistant, a professional host assistant and a great salesperson for our apartments.
    
    CONTEXT:
    - Current Apartment: ${activeApt?.name || "None selected"}
    - Apartment UUID: ${activeApt?.id || "None"}
    - Guest Status: ${verifiedBooking ? "Verified Resident" : "Public Visitor"}

    STRICT GROUNDING RULES:
    1. FACT SOURCE: Use ONLY the "DATA FROM TABLE" section below for apartment-specific details (address, wifi, door codes, check-in, amenities).
    2. AMENITIES & COOKING: If a guest asks about cooking or a specific appliance (like a stove, oven, or toaster), look at the amenities listed in the table. If an appliance is NOT mentioned in the table for that apartment, it means it is NOT available.
    3. NO HALLUCINATION: If you have absolutely no information about a requested detail in the table, do NOT say you will ask Anna. Instead, provide a professional and welcoming response that highlights our high standards for all apartments.
    4. SEARCH: Use Google Search ONLY for general Helsinki tips (restaurants, cafes, museums, transport, neighbourhood info, bars).
    
    PRIVACY RULES:
    - If Public Visitor: You only have access to PUBLIC data (is_private: false). If a guest asks for private details (like door codes, exact address, or Wi-Fi passwords), politely explain that this specific information is private and shared only with verified guests. Encourage them to login to their booking or make a reservation to access these details.
    - If Verified Resident: You have full access to share all details in the table (both public and private).
    
    STYLE RULES:
    - TONE: Professional, welcoming, and persuasive (salesperson).
    - FORMATTING: STRICTLY FORBIDDEN to use markdown bolding (**text**). Never use double asterisks. Use regular text or Capitalization for emphasis.
    - CONCISE: Keep responses relatively short and conversational.
    
    DATA FROM TABLE:
    ${tableData || "No data available for this apartment yet."}`;

    try {
      // Robust API key retrieval - following skill recommendations
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      
      if (!apiKey) {
        setMsgs(p => [...p, { role: "assistant", text: "I'm sorry, I can't connect to my brain right now (API key missing). Please check the settings!" }]);
        setLoading(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          ...history.map(h => ({
            role: h.role,
            parts: h.parts
          })),
          { role: "user", parts: [{ text: txt }] }
        ],
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} } as any]
        }
      });

      const rawReply = response.text || "I'm sorry, I couldn't generate a response.";
      const reply = rawReply.replace(/\*\*/g, "");
      setMsgs(p => [...p, { role: "assistant", text: reply }]);
      setHistory(p => [...p, { role: "user", parts: [{ text: txt }] }, { role: "assistant", parts: [{ text: reply }] }]);
    } catch (e) {
      console.error("AI Error:", e);
      setMsgs(p => [...p, { role: "assistant", text: "I'm having a connection hiccup. Could you try that again?" }]);
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
        <div className="fixed bottom-[150px] right-7 w-[340px] h-[500px] bg-warm-white border border-mist z-[999] flex flex-col shadow-2xl rounded-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
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
              <input type="email" placeholder="Email" required value={verifyForm.email} onChange={e => setVerifyForm({...verifyForm, email: e.target.value})} className="w-full p-2 text-xs border border-mist outline-none focus:border-clay" />
              <input type="text" placeholder="Reference" required value={verifyForm.ref} onChange={e => setVerifyForm({...verifyForm, ref: e.target.value})} className="w-full p-2 text-xs border border-mist outline-none focus:border-clay" />
              {verifyError && <p className="text-[0.6rem] text-clay italic">{verifyError}</p>}
              <button type="submit" className="w-full bg-forest text-white p-2 text-[0.6rem] font-bold uppercase tracking-widest">Verify</button>
            </form>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.map((m, i) => (
              <div key={i} className={`p-3 text-sm leading-relaxed flex flex-col ${m.role === "user" ? "bg-forest text-white self-end rounded-l-lg rounded-tr-lg ml-8" : "bg-cream text-charcoal self-start rounded-r-lg rounded-tl-lg border border-mist mr-8"}`}>
                <span>{m.text}</span>
                {m.role === "assistant" && !verifiedBooking && selectedAptId && i > 0 && (
                  <button 
                    onClick={() => {
                      console.log("ChatBot: Book Now clicked for selectedAptId:", selectedAptId);
                      if (selectedAptId) {
                        onBookNow?.(selectedAptId);
                      } else {
                        console.error("ChatBot: No selectedAptId found when clicking Book Now");
                      }
                    }}
                    className="mt-3 pt-2 border-t border-mist/40 flex items-center gap-1.5 text-[0.6rem] font-bold tracking-[0.2em] text-forest hover:text-clay transition-colors uppercase self-start group"
                  >
                    Book Now 
                    <ExternalLink size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                )}
              </div>
            ))}
            {loading && <div className="text-[0.7rem] italic text-muted animate-pulse">Anna is typing...</div>}
            <div ref={bottomRef} />
          </div>

          {!loading && !showVerifyForm && (
            <div className="p-2 px-4 flex flex-wrap gap-2">
              {!selectedAptId ? (
                (listings.length > 0 ? listings : LISTINGS).map(l => (
                  <button key={l.id} onClick={() => { setSelectedAptId(l.id); setMsgs(p => [...p, {role: 'assistant', text: `I'd love to tell you about ${l.name}!` }]) }} className="text-[0.65rem] border border-mist px-2 py-1 rounded-full bg-white hover:bg-mist transition-colors shadow-sm">{l.name}</button>
                ))
              ) : (
                <>
                  {suggestedCategories.map(c => (
                    <button 
                      key={c} 
                      onClick={() => { 
                        const getQuestion = (cat: string) => {
                          const lower = cat.toLowerCase();
                          if (lower.includes("kitchen")) return "Tell me about the kitchen";
                          if (lower.includes("internet")) return "Is there internet in the apartment?";
                          if (lower.includes("wifi")) return "What is the Wi-Fi password?";
                          if (lower.includes("check-in") || lower.includes("checkin")) return "How does check-in work?";
                          if (lower.includes("check-out")) return "How does check-out work?";
                          if (lower.includes("policies")) return "What are the apartment policies?";
                          if (lower.includes("location")) return "Tell me about the location";
                          if (lower.includes("amenities")) return "What amenities are available?";
                          if (lower.includes("house rules")) return "What are the house rules?";
                          if (lower.includes("address")) return "What is the address of the apartment?";
                          if (lower.includes("directions")) return "How do I get to the apartment?";
                          return `Tell me about the ${lower}`;
                        };
                        setInput(getQuestion(c)); 
                        setTimeout(() => {
                          const sendBtn = document.getElementById('chat-send');
                          sendBtn?.click();
                        }, 100);
                      }} 
                      className="text-[0.65rem] border border-forest/20 px-2 py-1 rounded-full bg-forest/5 text-forest hover:bg-forest/10 transition-colors shadow-sm"
                    >
                      {c}
                    </button>
                  ))}
                  {!verifiedBooking && (
                    <button 
                      onClick={() => { 
                        setSelectedAptId(null); 
                        setMsgs([{ role: "assistant", text: "Hei! Welcome to Anna's Stays. I'm here to help with your stay or any Helsinki tips. What's on your mind?" }]);
                        setHistory([]);
                      }} 
                      className="text-[0.65rem] border border-clay/20 px-2 py-1 rounded-full bg-clay/5 text-clay italic"
                    >
                      ← Change
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="p-3 border-t border-mist bg-white flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask me anything..." className="flex-1 p-2 text-sm border border-mist outline-none focus:border-clay bg-cream/20" />
            <button id="chat-send" onClick={send} className="bg-forest text-white px-3 py-2 rounded-sm hover:bg-forest/90 transition-colors flex items-center justify-center">
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
