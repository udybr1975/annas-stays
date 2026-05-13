import { useState, useEffect } from "react";

export default function EventsPage({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    setEvents(null);

    const MAX_RETRIES = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise(r => setTimeout(r, attempt * 3000));
        }

        const res = await fetch('/api/helsinki-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        if (data.error) throw new Error('API returned error');

        setEvents(data);
        setLoading(false);
        return;

      } catch (e: any) {
        lastError = e;
        const msg = (e?.message || '').toLowerCase();
        const isRetryable = msg.includes('503') || msg.includes('high demand') || msg.includes('unavailable') || msg.includes('overload');
        console.warn(`Helsinki Guide: attempt ${attempt} failed — ${e?.message}`);
        if (!isRetryable) break;
      }
    }

    console.error('Helsinki Guide Error:', lastError);
    setError('unavailable');
    setLoading(false);
  };

  useEffect(() => {
    loadEvents();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#fdfcfb] w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl shadow-2xl relative p-8 md:p-12"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-black text-2xl transition-colors">
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
          <div className="py-16 text-center flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-[#f7f4ef] flex items-center justify-center text-3xl">🌍</div>
            <div>
              <p className="font-serif text-xl font-light text-[#1a3c34] mb-2">Back soon</p>
              <p className="text-sm text-gray-500 font-light leading-relaxed max-w-xs mx-auto">
                Our Helsinki events guide is taking a short break. Check back in a little while — or ask Anna directly via the chat.
              </p>
            </div>
            <button
              onClick={loadEvents}
              className="text-xs border border-[#1a3c34] text-[#1a3c34] px-5 py-2.5 hover:bg-[#1a3c34] hover:text-white transition-colors tracking-widest uppercase font-sans"
            >
              Try again
            </button>
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
