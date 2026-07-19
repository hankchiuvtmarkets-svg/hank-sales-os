import { executeAgent } from '../lib/agent.js';
import { createOpenAIClient, createTavilyClient } from '../lib/providers.js';
import {
  createRepository,
  requireAuthorized,
  safeErrorResponse,
  sendMethodNotAllowed
} from '../lib/server.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
  if (!requireAuthorized(req, res)) return;

  try {
    const result = await executeAgent({
      repository: createRepository(),
      openai: createOpenAIClient({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-5-mini'
      }),
      search: createTavilyClient({ apiKey: process.env.TAVILY_API_KEY })
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json(safeErrorResponse(error));
  }
}
