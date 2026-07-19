import {
  createRepository,
  requireDashboardAuthorized,
  safeErrorResponse,
  sendMethodNotAllowed
} from '../lib/server.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
  if (!requireDashboardAuthorized(req, res)) return;
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit || 100), 1), 500);
    const leads = await createRepository().getCloudLeads(limit);
    return res.status(200).json({ ok: true, leads });
  } catch (error) {
    console.error(JSON.stringify({ event: 'cloud_leads_failed', message: error.message }));
    return res.status(500).json(safeErrorResponse(error));
  }
}
