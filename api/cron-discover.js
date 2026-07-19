import { requireAuthorized, safeErrorResponse, sendMethodNotAllowed } from '../lib/server.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return sendMethodNotAllowed(res, ['GET', 'POST']);
  if (!requireAuthorized(req, res)) return;

  try {
    const baseUrl = process.env.APP_URL;
    if (!baseUrl) throw new Error('Missing APP_URL');
    const response = await fetch(new URL('/api/run-agent', baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CRON_SECRET}`
      },
      body: '{}'
    });
    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (!response.ok) throw new Error(data.error || `Autonomous agent HTTP ${response.status}`);
    return res.status(200).json(data);
  } catch (error) {
    console.error(JSON.stringify({ event: 'cron_discover_failed', message: error.message }));
    return res.status(500).json(safeErrorResponse(error));
  }
}
