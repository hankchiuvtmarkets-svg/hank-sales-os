import { resolveAgentSettings } from './config.js';
import {
  canonicalizeUrl,
  deduplicateResults,
  detectPlatform,
  normalizeHandle,
  sameAccountKey
} from './normalization.js';

function errorDetails(error, step) {
  return {
    at: new Date().toISOString(),
    level: 'error',
    step,
    provider: error.provider || null,
    status: error.status || null,
    message: error.message || String(error)
  };
}

function estimateOpenAiCost(usage, environment) {
  const inputRate = Number(environment.OPENAI_INPUT_COST_PER_MILLION_USD || 0.25);
  const outputRate = Number(environment.OPENAI_OUTPUT_COST_PER_MILLION_USD || 2);
  const inputTokens = Number(usage?.input_tokens || usage?.inputTokens || 0);
  const outputTokens = Number(usage?.output_tokens || usage?.outputTokens || 0);
  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
}

function validatedStrategies(payload, limit) {
  const rows = Array.isArray(payload) ? payload : payload?.strategies;
  if (!Array.isArray(rows)) throw new Error('Strategy response has no strategies array');
  const seen = new Set();
  return rows
    .map((row) => ({
      query: String(row?.query || '').trim(),
      market: String(row?.market || '').trim(),
      target_type: String(row?.target_type || '').trim(),
      reason: String(row?.reason || '').trim()
    }))
    .filter((row) => row.query && !seen.has(row.query.toLowerCase()) && seen.add(row.query.toLowerCase()))
    .slice(0, limit);
}

function validatedLeads(payload, candidateResults, minLeadScore) {
  const rows = Array.isArray(payload) ? payload : payload?.leads;
  if (!Array.isArray(rows)) throw new Error('Analysis response has no leads array');
  const candidatesByUrl = new Map(candidateResults.map((result) => [result.canonicalUrl, result]));
  const seen = new Set();
  const leads = [];
  for (const row of rows) {
    const resultUrl = canonicalizeUrl(row?.result_url);
    const evidence = candidatesByUrl.get(resultUrl);
    const score = Math.min(100, Math.max(0, Math.round(Number(row?.score) || 0)));
    if (!evidence || score < minLeadScore) continue;
    const profileUrl = canonicalizeUrl(row.profile_url) || resultUrl;
    if (profileUrl !== resultUrl) continue;
    const platform = String(row.platform || evidence.platform || detectPlatform(profileUrl));
    const handle = String(row.handle || '').trim();
    const accountKey = sameAccountKey({ platform, handle, profile_url: profileUrl });
    if (!accountKey || seen.has(accountKey)) continue;
    seen.add(accountKey);
    leads.push({
      name: String(row.name || evidence.title || handle || profileUrl).slice(0, 240),
      handle: handle.slice(0, 240),
      normalized_handle: normalizeHandle(handle || profileUrl),
      account_key: accountKey,
      profile_url: profileUrl,
      country: ['韓國', '日本', '香港', '澳門'].includes(row.country) ? row.country : (evidence.market || '其他'),
      platform,
      summary: String(row.summary || '').slice(0, 4000),
      recent_content: String(row.recent_content || evidence.content || '').slice(0, 4000),
      pain_points: Array.isArray(row.pain_points) ? row.pain_points.map(String).slice(0, 10) : [],
      score,
      suggested_message: String(row.message || '').slice(0, 4000),
      message_language: row.language === 'ja' ? 'ja' : row.language === 'zh' ? 'zh' : 'ko',
      source_query: evidence.query || ''
    });
  }
  return leads;
}

export async function executeAgent({
  repository,
  openai,
  search,
  environment = process.env,
  now = () => new Date()
}) {
  const logs = [];
  let run = null;
  let estimatedCostUsd = 0;
  let searchCount = 0;
  const startedAt = now();

  const addLog = (level, step, message, extra = {}) => {
    const entry = { at: now().toISOString(), level, step, message, ...extra };
    logs.push(entry);
    if (level === 'error') console.error(JSON.stringify({ event: 'sales_agent_error', ...entry }));
  };

  try {
    const settingsRow = await repository.getAgentSettings();
    const settings = resolveAgentSettings(settingsRow, environment);
    const dayStart = new Date(startedAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const usage = await repository.getDailyUsage(dayStart.toISOString());
    const remainingSearches = Math.max(0, settings.dailySearchLimit - usage.searchCount);
    const remainingBudget = Math.max(0, settings.dailyCostLimitUsd - usage.costUsd);

    run = await repository.createRun({
      market: settings.targetMarkets.join('、'),
      target: settings.targetTypes.join('、'),
      strategies: [],
      status: 'running',
      started_at: startedAt.toISOString(),
      daily_search_limit: settings.dailySearchLimit,
      daily_cost_limit_usd: settings.dailyCostLimitUsd,
      logs: []
    });

    if (!settings.enabled) throw new Error('Agent is disabled in agent_settings');
    if (remainingSearches < 1) throw new Error('Daily search limit reached');
    if (remainingBudget < settings.openAiReservePerCallUsd * 2 + settings.tavilyCostPerSearchUsd) {
      throw new Error('Daily cost limit reached');
    }

    const budgetedSearches = Math.max(1, Math.floor(
      (remainingBudget - settings.openAiReservePerCallUsd * 2) / Math.max(settings.tavilyCostPerSearchUsd, 0.000001)
    ));
    const strategyCount = Math.min(remainingSearches, settings.dailySearchLimit, budgetedSearches);
    addLog('info', 'strategy', `Generating up to ${strategyCount} search strategies`);
    const strategyResponse = await openai.generateStrategies({
      markets: settings.targetMarkets,
      targetTypes: settings.targetTypes,
      count: strategyCount
    });
    estimatedCostUsd += Math.max(
      settings.openAiReservePerCallUsd,
      estimateOpenAiCost(strategyResponse.usage, environment)
    );
    const strategies = validatedStrategies(strategyResponse.data, strategyCount);
    if (!strategies.length) throw new Error('OpenAI returned no usable search strategies');
    await repository.updateRun(run.id, { strategies, status: 'searching', logs });

    const searches = await Promise.all(strategies.map(async (strategy) => {
      try {
        const rows = await search.search({
          query: strategy.query,
          maxResults: settings.maxResultsPerQuery
        });
        searchCount += 1;
        estimatedCostUsd += settings.tavilyCostPerSearchUsd;
        return rows.map((row) => ({ ...row, market: strategy.market, targetType: strategy.target_type }));
      } catch (error) {
        searchCount += 1;
        estimatedCostUsd += settings.tavilyCostPerSearchUsd;
        const entry = errorDetails(error, 'tavily_search');
        entry.query = strategy.query;
        logs.push(entry);
        console.error(JSON.stringify({ event: 'sales_agent_provider_error', ...entry }));
        return [];
      }
    }));
    if (!searches.some((rows) => rows.length)) throw new Error('All public-web searches failed or returned no results');

    const uniqueResults = deduplicateResults(searches.flat());
    const storedResults = uniqueResults.map((result) => ({
      search_run_id: run.id,
      query: result.query,
      title: result.title,
      url: result.url,
      canonical_url: result.canonicalUrl,
      content: result.content,
      provider_score: result.providerScore,
      market: result.market,
      platform: result.platform,
      is_candidate: result.candidate,
      rejection_reason: result.reason,
      raw_data: result.rawData || {}
    }));
    await repository.storeSearchResults(storedResults);
    const candidates = uniqueResults.filter((result) => result.candidate);
    addLog('info', 'filter', `${uniqueResults.length} unique results; ${candidates.length} profile candidates`);

    let createdLeads = 0;
    let createdDrafts = 0;
    if (candidates.length) {
      if (estimatedCostUsd + settings.openAiReservePerCallUsd > remainingBudget) {
        throw new Error('Daily cost limit would be exceeded before result analysis');
      }
      const analysisResponse = await openai.analyzeResults({
        results: candidates.map((result) => ({
          url: result.canonicalUrl,
          title: String(result.title || '').slice(0, 300),
          snippet: String(result.content || '').slice(0, 1200),
          query: result.query,
          market: result.market,
          platform: result.platform
        })),
        minScore: settings.minLeadScore
      });
      estimatedCostUsd += Math.max(
        settings.openAiReservePerCallUsd,
        estimateOpenAiCost(analysisResponse.usage, environment)
      );
      const analyzedLeads = validatedLeads(analysisResponse.data, candidates, settings.minLeadScore);
      const existing = await repository.findExistingLeads({
        profileUrls: analyzedLeads.map((lead) => lead.profile_url),
        accountKeys: analyzedLeads.map((lead) => lead.account_key)
      });
      const existingUrls = new Set(existing.map((lead) => lead.profile_url).filter(Boolean));
      const existingAccounts = new Set(existing.map((lead) => lead.account_key).filter(Boolean));

      for (const candidate of analyzedLeads) {
        if (existingUrls.has(candidate.profile_url) || existingAccounts.has(candidate.account_key)) {
          addLog('info', 'deduplicate', `Skipped existing lead ${candidate.profile_url}`);
          continue;
        }
        try {
          const lead = await repository.createLead({
            ...candidate,
            search_run_id: run.id,
            stage: '待審核'
          });
          createdLeads += 1;
          existingUrls.add(candidate.profile_url);
          existingAccounts.add(candidate.account_key);
          const draft = await repository.createDraft({
            lead_id: lead.id,
            search_run_id: run.id,
            language: candidate.message_language,
            purpose: 'first_contact',
            body: candidate.suggested_message,
            status: 'pending_approval'
          });
          if (draft) createdDrafts += 1;
          await repository.createActivity({
            lead_id: lead.id,
            search_run_id: run.id,
            type: 'lead_discovered',
            details: { source_query: candidate.source_query, score: candidate.score }
          });
        } catch (error) {
          const entry = errorDetails(error, 'persist_lead');
          entry.profile_url = candidate.profile_url;
          logs.push(entry);
          console.error(JSON.stringify({ event: 'sales_agent_persistence_error', ...entry }));
        }
      }
    }

    const completed = await repository.updateRun(run.id, {
      status: 'completed',
      completed_at: now().toISOString(),
      result_count: uniqueResults.length,
      candidate_count: candidates.length,
      new_lead_count: createdLeads,
      draft_count: createdDrafts,
      search_count: searchCount,
      estimated_cost_usd: Number(estimatedCostUsd.toFixed(6)),
      error_message: null,
      logs
    });
    return {
      ok: true,
      runId: completed.id,
      resultCount: uniqueResults.length,
      candidateCount: candidates.length,
      newLeadCount: createdLeads,
      draftCount: createdDrafts,
      searchCount,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6))
    };
  } catch (error) {
    const entry = errorDetails(error, 'run_agent');
    logs.push(entry);
    console.error(JSON.stringify({ event: 'sales_agent_run_failed', runId: run?.id || null, ...entry }));
    if (run?.id) {
      try {
        await repository.updateRun(run.id, {
          status: 'failed',
          completed_at: now().toISOString(),
          search_count: searchCount,
          estimated_cost_usd: Number(estimatedCostUsd.toFixed(6)),
          error_message: error.message || String(error),
          logs
        });
      } catch (updateError) {
        console.error(JSON.stringify({
          event: 'sales_agent_failure_log_write_failed',
          runId: run.id,
          message: updateError.message
        }));
      }
    }
    throw error;
  }
}

export { validatedLeads, validatedStrategies };
