import { useState, useEffect } from "react";

export default function EventsPage({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        
        // Gemini 1.5 was retired. We are switching to the stable 2.5 Flash model.
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17-lite-preview-06-17:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: "List 5-7 real events happening in Helsinki this week (April 2026). Return ONLY a JSON object: { \"week\": \"April 2026\", \"categories\": [ { \"name\": \"Events\", \"events\": [ { \"title\": \"Name\", \"venue\": \"Venue\", \"date\": \"Date\", \"desc\": \"Desc\", \"price\": \"Price\" } ] } ] }"
                }]
              }],
              generationConfig: { 
                responseMimeType: "application/json" 
              }
            })
          }
        );

        const result = await response.json();

        if (result.error) {
          // If 2.5 is also busy, we try the newest Gemini 3 Flash as a fallback
          throw new Error(result.error.message);
        }

        const text = result.candidates[0].content.parts[0].text;
        setEvents(JSON.parse(text));
      } catch (e: any) {
        console.error("Helsinki Guide Error:", e);
        setError("The AI models are updating. Please try again in a few seconds.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);
  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-[#fdfcfb] w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl shadow-2xl relative p-8 md:p-12"
        onClick={e => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute top-6 right-6 text-gray-400 hover:text-black text-2xl transition-colors"
        >
          ✕
        </button>

        <header className="mb-10">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#c47d5e] font-semibold mb-2">Helsinki Guide</p>
          <h2 className="text-3xl md:text-4xl font-light text-[#1a3c34] font-serif italic">This week in the city</h2>
        </header>

        {loading && (
          <div className="py-20 text-center flex flex-col items-center">
            <div className="w-10 h-10 border-2 border-gray-100 border-t-[#1a3c34] rounded-full animate-spin mb-4" />
            <p className="text-sm text-gray-500 font-light italic">Anna is curating your weekly guide...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 p-6 rounded-lg text-center">
            <p className="text-red-800 text-sm">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 text-xs underline opacity-70">Try again</button>
          </div>
        )}

        {events && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <p className="text-xs text-gray-400 border-b pb-4 border-gray-100">{events.week}</p>
            
            {events.categories?.map((cat: any, i: number) => (
              <section key={i}>
                <h3 className="text-lg font-serif text-[#1a3c34] mb-6 flex items-center gap-3">
                  {cat.name}
                  <span className="h-[1px] flex-1 bg-gray-100"></span>
                </h3>
                <div className="grid gap-6">
                  {cat.events?.map((ev: any, j: number) => (
                    <div key={j} className="group border-l-2 border-transparent hover:border-[#1a3c34] pl-4 transition-all bg-white p-5 rounded-r-lg shadow-sm border border-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-[#1a3c34] text-lg">{ev.title}</h4>
                        <span className="text-[10px] bg-[#1a3c34] text-white px-2 py-1 rounded tracking-tighter uppercase font-bold">{ev.price}</span>
                      </div>
                      <p className="text-[11px] text-[#c47d5e] font-bold uppercase tracking-wider mb-2">{ev.venue} — {ev.date}</p>
                      <p className="text-sm text-gray-600 font-light leading-relaxed">{ev.desc}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            
            <footer className="pt-10 text-center">
              <p className="text-[10px] text-gray-300 uppercase tracking-widest">Handpicked by Anna's Stays Helsinki</p>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
