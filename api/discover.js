import { resolveAgentSettings } from '../lib/config.js';
import { createOpenAIClient } from '../lib/providers.js';
import {
  createRepository,
  requireAuthorized,
  safeErrorResponse,
  sendMethodNotAllowed
} from '../lib/server.js';
import { validatedStrategies } from '../lib/agent.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendMethodNotAllowed(res, ['POST']);
  if (!requireAuthorized(req, res)) return;

  let repository;
  let run;
  try {
    repository = createRepository();
    const settings = resolveAgentSettings(await repository.getAgentSettings());
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const usage = await repository.getDailyUsage(dayStart.toISOString());
    if (usage.costUsd + settings.openAiReservePerCallUsd > settings.dailyCostLimitUsd) {
      throw new Error('Daily cost limit reached');
    }
    const market = String(req.body?.market || settings.targetMarkets.join('、')).slice(0, 500);
    const target = String(req.body?.target || settings.targetTypes.join('、')).slice(0, 1000);
    const count = Math.min(settings.dailySearchLimit, 12);
    run = await repository.createRun({
      market,
      target,
      strategies: [],
      status: 'planning',
      started_at: new Date().toISOString(),
      search_count: 0,
      estimated_cost_usd: 0,
      daily_search_limit: settings.dailySearchLimit,
      daily_cost_limit_usd: settings.dailyCostLimitUsd,
      logs: []
    });
    const openai = createOpenAIClient({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-5-mini'
    });
    const response = await openai.generateStrategies({
      markets: market.split('、'),
      targetTypes: target.split('、'),
      count
    });
    const strategies = validatedStrategies(response.data, count);
    await repository.updateRun(run.id, {
      strategies,
      status: 'planned',
      estimated_cost_usd: settings.openAiReservePerCallUsd,
      logs: [{
        at: new Date().toISOString(),
        level: 'info',
        step: 'strategy',
        message: `Generated ${strategies.length} strategies without executing searches`
      }]
    });
    return res.status(200).json({ ok: true, runId: run.id, strategies });
  } catch (error) {
    console.error(JSON.stringify({ event: 'discover_failed', message: error.message }));
    if (repository && run?.id) {
      try {
        await repository.updateRun(run.id, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message,
          logs: [{
            at: new Date().toISOString(),
            level: 'error',
            step: 'strategy',
            message: error.message,
            provider: error.provider || null,
            status: error.status || null
          }]
        });
      } catch (logError) {
        console.error(JSON.stringify({ event: 'discover_failure_log_write_failed', message: logError.message }));
      }
    }
    return res.status(500).json(safeErrorResponse(error));
  }
}
