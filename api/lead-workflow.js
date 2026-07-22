import {
  createRepository,
  requireDashboardAuthorized,
  safeErrorResponse,
  sendMethodNotAllowed
} from '../lib/server.js';
import { workflowPayload } from '../lib/lead-workflow.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
  if (!requireDashboardAuthorized(req, res)) return;
  try {
    const payload = workflowPayload(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    const result = await createRepository().setLeadWorkflow(payload);
    return res.status(200).json({ ok: true, lead: result });
  } catch (error) {
    console.error(JSON.stringify({ event: 'lead_workflow_failed', message: error.message }));
    return res.status(400).json(safeErrorResponse(error));
  }
}
