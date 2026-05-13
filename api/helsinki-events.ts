import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[helsinki-events] GEMINI_API_KEY not set');
    return res.status(200).json({ error: true });
  }

  const now = new Date();
  const today = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(now.getDate() + 7);
  const until = sevenDaysLater.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const prompt = `Today is ${today}. List 5-7 real events happening in Helsinki between ${today} and ${until} (the next 7 days only). Do not include past events. Return ONLY a valid JSON object with no markdown, no code fences, just raw JSON: { "week": "${today} – ${until}", "categories": [ { "name": "Events", "events": [ { "title": "Name", "venue": "Venue", "date": "Date", "desc": "Short description", "price": "Free or €XX" } ] } ] }`;

  const ai = new GoogleGenAI({ apiKey });
  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        await new Promise(r => setTimeout(r, attempt * 3000));
      }

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: 'application/json' },
      });

      const text = response.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return res.status(200).json(parsed);

    } catch (e: any) {
      lastError = e;
      const msg = (e?.message || '').toLowerCase();
      const isRetryable = msg.includes('503') || msg.includes('high demand') || msg.includes('unavailable') || msg.includes('overload');
      console.warn(`[helsinki-events] attempt ${attempt} failed — ${e?.message}`);
      if (!isRetryable) break;
    }
  }

  console.error('[helsinki-events] all attempts failed:', lastError?.message);
  return res.status(200).json({ error: true });
}
