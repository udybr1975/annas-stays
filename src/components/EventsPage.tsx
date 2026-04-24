import { useState, useEffect } from "react";
import { GoogleGenAI, Type } from "@google/genai";
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
        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || "" });

        const response = await ai.models.generateContent({
          model: "gemini-1.5-flash",
          contents: `Generate a Helsinki weekly events digest for the current week. Today is ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Use real Helsinki venues.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                week: { type: Type.STRING },
                categories: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      events: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            title: { type: Type.STRING },
                            venue: { type: Type.STRING },
                            date: { type: Type.STRING },
                            desc: { type: Type.STRING },
                            price: { type: Type.STRING }
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
        setError(e.message);
      }
      setLoading(false);
    };

    generate();
  }, []);

  return (
    <div className="fixed inset-0 bg-charcoal/60 z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-warm-white w-full max-w-[700px] max-h-[90vh] overflow-y-auto p-10 relative font-sans" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-5 bg-none border-none text-xl cursor-pointer text-muted">✕</button>
        <p className="text-[0.62rem] tracking-widest uppercase text-clay mb-1.5 font-sans">Helsinki Guide</p>
        <h2 className="font-serif text-[2rem] font-light mb-4">This week in Helsinki</h2>

        {loading && (
          <div className="py-12 text-center">
            <div className="text-[0.82rem] text-muted mb-4">Generating this week's events...</div>
            <div className="w-9 h-9 border-2 border-mist border-t-forest rounded-full mx-auto animate-spin" />
          </div>
        )}

        {error && <div className="p-6 bg-red-50 text-red-800 text-[0.82rem]">{error}</div>}

        {events && (
          <div>
            <p className="text-[0.82rem] text-muted mb-7 font-light">{events.week} · Curated by Anna's Stays</p>
            {(events.categories || []).map((cat, ci) => (
              <div key={ci} className="mb-7">
                <h3 className="font-serif text-xl font-light text-charcoal mb-3 pb-2 border-b border-mist">{cat.name}</h3>
                <div className="flex flex-col gap-2">
                  {(cat.events || []).map((ev, ei) => (
                    <div key={ei} className="bg-cream p-4 px-5">
                      <div className="flex justify-between items-baseline mb-1 flex-wrap gap-2">
                        <span className="font-serif text-lg font-light text-charcoal">{ev.title}</span>
                        <span className="text-[0.72rem] text-forest font-sans bg-forest/8 p-0.5 px-2">{ev.price}</span>
                      </div>
                      <div className="text-[0.72rem] text-clay mb-1 font-sans">{ev.venue} · {ev.date}</div>
                      <div className="text-[0.8rem] text-muted leading-relaxed font-light">{ev.desc}</div>
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
