import React, { useState, useRef, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { LISTINGS } from "../constants";
import { supabase } from "../lib/supabase";
import { Send, ExternalLink } from "lucide-react";

export default function ChatBot({ initialBooking, initialListing, listings = [], onBookNow }: any) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ role: "assistant", text: "Hei! Welcome to Anna's Stays. How can I help with your Helsinki trip?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [selectedAptId, setSelectedAptId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const txt = input.trim();
    setInput("");
    setMsgs(p => [...p, { role: "user", text: txt }]);
    setLoading(true);

    try {
      // 1. FORCED KEY DEFINITION
      const MY_PASSED_KEY = "AIzaSyBQKHNsImtU_efF6N2bheZdKIw6y9E69i0";
      
      // 2. IMMEDIATE INITIALIZATION INSIDE THE CLICK EVENT
      const genAI = new GoogleGenAI(MY_PASSED_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const result = await model.generateContent(txt);
      const response = await result.response;
      const reply = response.text().replace(/\*\*/g, "");
      
      setMsgs(p => [...p, { role: "assistant", text: reply }]);
    } catch (e: any) {
      console.error("AI Error:", e);
      setMsgs(p => [...p, { role: "assistant", text: "Connection hiccup. Please try again in a moment." }]);
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
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-charcoal">
            {msgs.map((m, i) => (
              <div key={i} className={`p-3 text-sm leading-relaxed flex flex-col ${m.role === "user" ? "bg-forest text-white self-end rounded-l-lg rounded-tr-lg ml-8" : "bg-cream text-charcoal self-start rounded-r-lg rounded-tl-lg border border-mist mr-8"}`}>
                <span>{m.text}</span>
              </div>
            ))}
            {loading && <div className="text-[0.7rem] italic text-muted">Anna is typing...</div>}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-mist bg-white flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask me anything..." className="flex-1 p-2 text-sm border border-mist outline-none bg-cream/20 text-charcoal" />
            <button onClick={send} className="bg-forest text-white px-3 py-2 rounded-sm hover:bg-forest/90 transition-colors">
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
