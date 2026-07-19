import { publicConfiguration } from '../lib/config.js';
import { createRepository, safeErrorResponse, sendMethodNotAllowed } from '../lib/server.js';

export async function healthCheck({ repository, environment = process.env }) {
  const agentSettingsRows = await repository.countAgentSettings();
  return {
    ok: true,
    database: 'connected',
    agentSettingsRows,
    configured: publicConfiguration(environment)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);
  try {
    return res.status(200).json(await healthCheck({ repository: createRepository() }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'health_check_failed', message: error.message }));
    return res.status(500).json(safeErrorResponse(error));
  }
}
