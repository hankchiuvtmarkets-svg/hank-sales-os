export const DEFAULT_AGENT_SETTINGS = Object.freeze({
  enabled: true,
  dailySearchLimit: 6,
  dailyCostLimitUsd: 1,
  maxResultsPerQuery: 5,
  minLeadScore: 55,
  targetMarkets: ['韓國', '日本', '香港', '澳門'],
  targetTypes: ['EA 開發者', '交易社群主', 'IB', '金融內容創作者'],
  openAiReservePerCallUsd: 0.05,
  tavilyCostPerSearchUsd: 0.01
});

export function requireSettings(names, environment = process.env) {
  const missing = names.filter((name) => !environment[name]);
  if (missing.length > 0) {
    throw new Error(`Server settings are incomplete: ${missing.join(', ')}`);
  }
}

function finiteNumber(value, fallback, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function stringArray(value, fallback) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    const parsed = value.split(',').map((item) => item.trim()).filter(Boolean);
    return parsed.length ? parsed : fallback;
  }
  return fallback;
}

export function resolveAgentSettings(row = {}, environment = process.env) {
  const defaults = DEFAULT_AGENT_SETTINGS;
  return {
    enabled: row.enabled ?? true,
    dailySearchLimit: Math.round(finiteNumber(
      environment.DAILY_SEARCH_LIMIT ?? row.daily_search_limit,
      defaults.dailySearchLimit,
      { min: 1, max: 50 }
    )),
    dailyCostLimitUsd: finiteNumber(
      environment.DAILY_COST_LIMIT_USD ?? row.daily_cost_limit_usd,
      defaults.dailyCostLimitUsd,
      { min: 0.1, max: 100 }
    ),
    maxResultsPerQuery: Math.round(finiteNumber(
      environment.MAX_RESULTS_PER_QUERY ?? row.max_results_per_query,
      defaults.maxResultsPerQuery,
      { min: 1, max: 20 }
    )),
    minLeadScore: Math.round(finiteNumber(
      environment.MIN_LEAD_SCORE ?? row.min_lead_score,
      defaults.minLeadScore,
      { min: 0, max: 100 }
    )),
    targetMarkets: stringArray(row.target_markets, defaults.targetMarkets),
    targetTypes: stringArray(row.target_types, defaults.targetTypes),
    openAiReservePerCallUsd: finiteNumber(
      environment.OPENAI_RESERVE_PER_CALL_USD,
      defaults.openAiReservePerCallUsd,
      { min: 0, max: 10 }
    ),
    tavilyCostPerSearchUsd: finiteNumber(
      environment.TAVILY_COST_PER_SEARCH_USD,
      defaults.tavilyCostPerSearchUsd,
      { min: 0, max: 10 }
    )
  };
}

export function publicConfiguration(environment = process.env) {
  return {
    supabase: Boolean(environment.SUPABASE_URL && environment.SUPABASE_SERVICE_ROLE_KEY),
    openai: Boolean(environment.OPENAI_API_KEY),
    search: Boolean(environment.TAVILY_API_KEY),
    cron: Boolean(environment.CRON_SECRET),
    appUrl: Boolean(environment.APP_URL),
    dashboard: Boolean(environment.DASHBOARD_TOKEN)
  };
}
