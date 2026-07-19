import { executeAgent } from '../lib/agent.js';
import { publicConfiguration } from '../lib/config.js';
import { createOpenAIClient, createTavilyClient } from '../lib/providers.js';
import {
  createRepository,
  requireDashboardAuthorized,
  safeErrorResponse,
  sendMethodNotAllowed
} from '../lib/server.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);

  const configured = publicConfiguration();
  const missing = ['supabase', 'openai', 'search'].filter((key) => !configured[key]);
  if (missing.length) {
    return res.status(202).json({
      ok: true,
      mode: 'scheduled_fallback',
      message: '持續搜尋已啟用；目前由安全排程定期更新加密名單。',
      immediateRunAvailable: false
    });
  }
  if (!requireDashboardAuthorized(req, res)) return;

  try {
    const result = await executeAgent({
      repository: createRepository(),
      openai: createOpenAIClient({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-5-mini'
      }),
      search: createTavilyClient({ apiKey: process.env.TAVILY_API_KEY })
    });
    return res.status(200).json({ ...result, mode: 'immediate' });
  } catch (error) {
    console.error(JSON.stringify({ event: 'manual_agent_run_failed', message: error.message }));
    return res.status(500).json(safeErrorResponse(error));
  }
}
