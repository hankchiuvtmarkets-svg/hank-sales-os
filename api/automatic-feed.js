import { loadAutomaticFeed } from '../lib/automatic-feed.js';
import { safeErrorResponse, sendMethodNotAllowed } from '../lib/server.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
  if (process.env.VERCEL_PRIVATE_SITE !== 'true') {
    return res.status(503).json({ ok: false, error: 'Private site access is not enabled' });
  }
  try {
    const feed = await loadAutomaticFeed();
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).json(feed);
  } catch (error) {
    console.error(JSON.stringify({ event: 'automatic_feed_failed', message: error.message }));
    return res.status(500).json(safeErrorResponse(error));
  }
}
