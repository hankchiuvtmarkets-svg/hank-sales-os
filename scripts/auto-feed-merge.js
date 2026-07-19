const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'ref', 'ref_src', 'source',
  'utm_campaign', 'utm_content', 'utm_medium', 'utm_source', 'utm_term'
]);

export function canonicalProfileUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return url.toString();
  } catch {
    return '';
  }
}

export function leadIdentityKeys(lead = {}) {
  const keys = [];
  const url = canonicalProfileUrl(lead.profile_url || lead.evidence_url || '');
  if (url) keys.push(`url:${url}`);
  const handle = String(lead.handle || '').trim().toLowerCase().replace(/^@/, '');
  const platform = String(lead.platform || '').trim().toLowerCase();
  if (handle) keys.push(`account:${platform || 'unknown'}:${handle}`);
  if (!keys.length && lead.id) keys.push(`id:${String(lead.id).trim().toLowerCase()}`);
  return [...new Set(keys)];
}

function newestValue(previous, incoming) {
  return Object.fromEntries(Object.entries({ ...previous, ...incoming })
    .filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

export function mergeAutomaticFeed(existing = {}, discovered = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const maxLeads = Number(options.maxLeads) || 100;
  const maxSeen = Number(options.maxSeen) || 2000;
  const maxHistory = Number(options.maxHistory) || 90;
  const entities = new Map();
  const aliases = new Map();

  const register = (entity) => {
    const entityAliases = [...new Set([entity.primary_key, ...(entity.aliases || [])].filter(Boolean))];
    const primary = entity.primary_key || entityAliases[0];
    if (!primary) return null;
    const normalized = { ...entity, primary_key: primary, aliases: entityAliases };
    entities.set(primary, normalized);
    for (const alias of entityAliases) aliases.set(alias, primary);
    return normalized;
  };

  for (const entity of Array.isArray(existing.seen_entities) ? existing.seen_entities : []) register(entity);

  const resolveEntity = (lead, create = true) => {
    const keys = leadIdentityKeys(lead);
    const knownPrimary = keys.map((key) => aliases.get(key)).find(Boolean);
    let entity = knownPrimary ? entities.get(knownPrimary) : null;
    if (!entity && create && keys.length) {
      entity = register({
        primary_key: keys[0], aliases: keys, first_seen: lead.first_seen || lead.found_at || now,
        last_seen: lead.last_seen || lead.found_at || now, times_seen: Number(lead.times_seen) || 1,
        latest_score: Number(lead.score) || 0, status: lead.status || 'active'
      });
    } else if (entity) {
      entity.aliases = [...new Set([...entity.aliases, ...keys])];
      for (const key of entity.aliases) aliases.set(key, entity.primary_key);
    }
    return entity;
  };

  const leadsByEntity = new Map();
  for (const lead of Array.isArray(existing.leads) ? existing.leads : []) {
    const entity = resolveEntity(lead);
    if (!entity) continue;
    leadsByEntity.set(entity.primary_key, {
      ...lead,
      first_seen: lead.first_seen || entity.first_seen,
      last_seen: lead.last_seen || entity.last_seen,
      times_seen: Number(lead.times_seen) || entity.times_seen
    });
  }

  let newEntityCount = 0;
  let duplicateCount = 0;
  const touched = new Set();
  for (const lead of Array.isArray(discovered) ? discovered : []) {
    const keys = leadIdentityKeys(lead);
    const existed = keys.some((key) => aliases.has(key));
    const entity = resolveEntity(lead);
    if (!entity) continue;
    if (!existed) newEntityCount += 1;
    else duplicateCount += 1;
    if (!touched.has(entity.primary_key)) {
      if (existed) entity.times_seen = (Number(entity.times_seen) || 1) + 1;
      entity.last_seen = now;
      entity.latest_score = Number(lead.score) || entity.latest_score || 0;
      entity.status = lead.status || entity.status || 'active';
      touched.add(entity.primary_key);
    }
    const previous = leadsByEntity.get(entity.primary_key) || {};
    leadsByEntity.set(entity.primary_key, {
      ...newestValue(previous, lead), first_seen: entity.first_seen,
      last_seen: entity.last_seen, times_seen: entity.times_seen
    });
  }

  const leads = [...leadsByEntity.values()]
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, maxLeads);
  const activeKeys = new Set(leads.flatMap(leadIdentityKeys));
  const seenEntities = [...entities.values()]
    .map((entity) => ({ ...entity, status: entity.aliases.some((key) => activeKeys.has(key)) ? 'active' : entity.status || 'archived' }))
    .sort((a, b) => String(b.last_seen).localeCompare(String(a.last_seen)))
    .slice(0, maxSeen);
  const history = [...(Array.isArray(existing.search_history) ? existing.search_history : [])];
  if (options.run) history.push({ ...options.run, completed_at: options.run.completed_at || now });

  return {
    ...existing,
    generated_at: now,
    leads,
    seen_entities: seenEntities,
    search_history: history.slice(-maxHistory),
    tracking_summary: {
      total_seen: seenEntities.length,
      active_leads: leads.length,
      new_this_run: newEntityCount,
      duplicates_this_run: duplicateCount,
      search_runs_retained: Math.min(history.length, maxHistory)
    }
  };
}
