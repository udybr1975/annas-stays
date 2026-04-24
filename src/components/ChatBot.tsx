import React, { useState, useRef, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { Send } from "lucide-react";

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ role: "assistant", text: "Hei! Welcome to Anna's Stays. How can I help?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
      // WE ARE PASSING THE RAW STRING DIRECTLY - NO VARIABLE
      const genAI = new GoogleGenAI("AIzaSyBQKHNsImtU_efF6N2bheZdKIw6y9E69i0");
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const result = await model.generateContent(txt);
      const response = await result.response;
      const reply = response.text().replace(/\*\*/g, "");
      
      setMsgs(p => [...p, { role: "assistant", text: reply }]);
    } catch (e: any) {
      console.error("AI Error:", e);
      setMsgs(p => [...p, { role: "assistant", text: "I'm having trouble connecting. Check your internet or try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-sans">
      <button onClick={() => setOpen(!open)} className="fixed bottom-[90px] right-7 bg-[#1a3c34] text-white w-12 h-12 rounded-full z-[999] shadow-lg flex items-center justify-center">
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="fixed bottom-[150px] right-7 w-[340px] h-[500px] bg-white border border-gray-200 z-[999] flex flex-col shadow-2xl rounded-lg overflow-hidden">
          <div className="bg-[#1a3c34] text-white p-3 font-bold text-sm">
            Anna's Assistant
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgs.map((m, i) => (
              <div key={i} className={`p-3 text-sm rounded-lg ${m.role === "user" ? "bg-[#1a3c34] text-white self-end ml-8" : "bg-gray-100 text-black self-start mr-8"}`}>
                {m.text}
              </div>
            ))}
            {loading && <div className="text-xs italic text-gray-500">Typing...</div>}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t flex gap-2">
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={e => e.key === "Enter" && send()} 
              placeholder="Ask me anything..." 
              className="flex-1 p-2 text-sm border rounded outline-none" 
            />
            <button onClick={send} className="bg-[#1a3c34] text-white px-3 py-2 rounded">
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
