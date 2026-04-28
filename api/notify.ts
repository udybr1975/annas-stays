export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { title, body, priority = 'default' } = req.body;
  if (!body) return res.status(400).json({ error: 'Missing body' });

  try {
    await fetch('https://ntfy.sh/annas-stays-helsinki-99', {
      method: 'POST',
      body: body,
      headers: {
        'Title': title || 'Anna\'s Stays',
        'Priority': priority,
        'Content-Type': 'text/plain',
      },
    });
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('ntfy failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
