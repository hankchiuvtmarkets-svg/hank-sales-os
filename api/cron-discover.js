export default async function handler(req, res) {
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const baseUrl = process.env.APP_URL;
    if (!baseUrl) throw new Error('Missing APP_URL');

    const response = await fetch(`${baseUrl}/api/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        market: '韓國與日本',
        target: 'EA開發者、交易社群主、IB與金融內容創作者'
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Discovery run failed');
    return res.status(200).json({ ok: true, ...data });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
