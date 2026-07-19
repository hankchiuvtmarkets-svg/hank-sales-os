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
    const status = await createRepository().getAgentStatus();
    return res.status(200).json({
      ok: true,
      count: status.pendingDraftCount,
      drafts: status.pendingDrafts
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'pending_drafts_failed', message: error.message }));
    return res.status(500).json(safeErrorResponse(error));
  }
}
