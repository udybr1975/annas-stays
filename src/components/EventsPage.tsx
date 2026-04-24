import { useState, useEffect } from "react";
import { GoogleGenAI } from "@google/genai"; 
import { C } from "../constants";

interface Event {
  title: string;
  venue: string;
  date: string;
  desc: string;
  price: string;
}

interface Category {
  name: string;
  events: Event[];
}

interface EventsData {
  week: string;
  categories: Category[];
}

export default function EventsPage({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<EventsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generate = async () => {
      try {
        // Explicitly using the key from Vercel environment variables
        const ai = new GoogleGenAI({ 
          apiKey: import.meta.env.VITE_GEMINI_API_KEY 
        });

        const response = await ai.models.generateContent({
          model: "gemini-1.5-flash-latest",
          contents: "Generate a Helsinki weekly events digest for April 2026. Use real Helsinki venues.",
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                week: { type: "STRING" },
                categories: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      events: {
                        type: "ARRAY",
                        items: {
                          type: "OBJECT",
                          properties: {
                            title: { type: "STRING" },
                            venue: { type: "STRING" },
                            date: { type: "STRING" },
                            desc: { type: "STRING" },
                            price: { type: "STRING" }
                          },
                          required: ["title", "venue", "date", "desc", "price"]
                        }
                      }
                    },
                    required: ["name", "events"]
                  }
                }
              },
              required: ["week", "categories"]
            }
          }
        });

        const data = JSON.parse(response.text || "{}");
        setEvents(data);
      } catch (e: any) {
        console.error("AI Error:", e);
        setError("Unable to load events. Please try again.");
      }
      setLoading(false);
    };
    generate();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-[700px] max-h-[90vh] overflow-y-auto p-10 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-5 text-xl cursor-pointer">✕</button>
        <p className="text-[0.62rem] tracking-widest uppercase text-gray-500 mb-1.5">Helsinki Guide</p>
        <h2 className="text-[2rem] font-light mb-4">This week in Helsinki</h2>
        
        {loading && (
          <div className="py-12 text-center">
            <div className="text-[0.82rem] text-gray-500 mb-4">Generating this week's events...</div>
            <div className="w-9 h-9 border-2 border-gray-200 border-t-black rounded-full mx-auto animate-spin" />
          </div>
        )}
        
        {error && <div className="p-6 bg-red-50 text-red-800 text-[0.82rem]">{error}</div>}
        
        {events && (
          <div>
            <p className="text-[0.82rem] text-gray-500 mb-7">{events.week} · Curated by Anna's Stays</p>
            {events.categories.map((cat, ci) => (
              <div key={ci} className="mb-7">
                <h3 className="text-xl font-light text-black mb-3 pb-2 border-b border-gray-100">{cat.name}</h3>
                <div className="flex flex-col gap-2">
                  {cat.events.map((ev, ei) => (
                    <div key={ei} className="bg-gray-50 p-4 px-5 rounded">
                      <div className="flex justify-between items-baseline mb-1 flex-wrap gap-2">
                        <span className="text-lg font-light">{ev.title}</span>
                        <span className="text-[0.72rem] text-white bg-black px-2 py-0.5">{ev.price}</span>
                      </div>
                      <div className="text-[0.72rem] text-gray-500 mb-1">{ev.venue} · {ev.date}</div>
                      <div className="text-[0.8rem] text-gray-600 leading-relaxed">{ev.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
