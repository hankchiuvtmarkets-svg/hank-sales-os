function dataOrThrow(result, context) {
  if (result.error) {
    const error = new Error(`${context}: ${result.error.message}`);
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

export function createSupabaseRepository(db) {
  return {
    async getAgentSettings() {
      const result = await db.from('agent_settings').select('*').limit(1).maybeSingle();
      return dataOrThrow(result, 'read agent_settings') || {};
    },

    async countAgentSettings() {
      const result = await db.from('agent_settings').select('*', { count: 'exact', head: true });
      if (result.error) throw new Error(`read agent_settings: ${result.error.message}`);
      return result.count || 0;
    },

    async getDailyUsage(startedAt) {
      const result = await db
        .from('search_runs')
        .select('search_count,estimated_cost_usd')
        .gte('started_at', startedAt);
      const rows = dataOrThrow(result, 'read daily search usage') || [];
      return rows.reduce((usage, row) => ({
        searchCount: usage.searchCount + (Number(row.search_count) || 0),
        costUsd: usage.costUsd + (Number(row.estimated_cost_usd) || 0)
      }), { searchCount: 0, costUsd: 0 });
    },

    async createRun(values) {
      const result = await db.from('search_runs').insert(values).select('*').single();
      return dataOrThrow(result, 'create search_run');
    },

    async updateRun(id, values) {
      const result = await db.from('search_runs').update(values).eq('id', id).select('*').single();
      return dataOrThrow(result, 'update search_run');
    },

    async storeSearchResults(rows) {
      if (!rows.length) return [];
      const result = await db
        .from('search_results')
        .upsert(rows, { onConflict: 'canonical_url', ignoreDuplicates: true })
        .select('*');
      return dataOrThrow(result, 'store search_results') || [];
    },

    async findExistingLeads({ profileUrls, accountKeys }) {
      const found = [];
      if (profileUrls.length) {
        const result = await db
          .from('leads')
          .select('id,profile_url,account_key')
          .in('profile_url', profileUrls);
        found.push(...(dataOrThrow(result, 'check duplicate lead URLs') || []));
      }
      if (accountKeys.length) {
        const result = await db
          .from('leads')
          .select('id,profile_url,account_key')
          .in('account_key', accountKeys);
        found.push(...(dataOrThrow(result, 'check duplicate lead accounts') || []));
      }
      return found;
    },

    async createLead(values) {
      const result = await db.from('leads').insert(values).select('*').single();
      return dataOrThrow(result, 'create lead');
    },

    async createDraft(values) {
      const existingResult = await db
        .from('message_drafts')
        .select('*')
        .eq('lead_id', values.lead_id)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const existing = dataOrThrow(existingResult, 'check existing message draft');
      if (existing) return existing;
      const result = await db
        .from('message_drafts')
        .insert(values)
        .select('*')
        .single();
      return dataOrThrow(result, 'create message draft');
    },

    async createActivity(values) {
      const result = await db.from('activities').insert(values).select('id').single();
      return dataOrThrow(result, 'create activity');
    },

    async getAgentStatus() {
      const [runsResult, leadsResult, draftsResult, settingsResult] = await Promise.all([
        db.from('search_runs').select('*').order('started_at', { ascending: false }).limit(10),
        db.from('leads').select('id', { count: 'exact', head: true }),
        db.from('message_drafts')
          .select('id,lead_id,language,purpose,body,status,created_at')
          .eq('status', 'pending_approval')
          .order('created_at', { ascending: false })
          .limit(20),
        db.from('agent_settings').select('*').limit(1).maybeSingle()
      ]);
      const runs = dataOrThrow(runsResult, 'read search_runs') || [];
      dataOrThrow(leadsResult, 'count leads');
      const drafts = dataOrThrow(draftsResult, 'read pending message_drafts') || [];
      const settings = dataOrThrow(settingsResult, 'read agent_settings') || {};
      return {
        recentRuns: runs,
        leadCount: leadsResult.count || 0,
        pendingDraftCount: drafts.length,
        pendingDrafts: drafts,
        settings
      };
    },

    async getCloudLeads(limit) {
      const result = await db
        .from('leads')
        .select('*')
        .order('score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
      return dataOrThrow(result, 'read cloud leads') || [];
    }
  };
}
