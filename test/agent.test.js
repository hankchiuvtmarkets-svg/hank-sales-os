import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAgent, validatedLeads } from '../lib/agent.js';

function fakeRepository({ existing = [], usage = { searchCount: 0, costUsd: 0 } } = {}) {
  const state = { runs: [], results: [], leads: [], drafts: [], activities: [], existing };
  return {
    state,
    async getAgentSettings() { return { daily_search_limit: 2, daily_cost_limit_usd: 1 }; },
    async getDailyUsage() { return usage; },
    async createRun(values) {
      const run = { id: `run-${state.runs.length + 1}`, ...values };
      state.runs.push(run);
      return run;
    },
    async updateRun(id, values) {
      const run = state.runs.find((item) => item.id === id);
      Object.assign(run, values);
      return run;
    },
    async storeSearchResults(rows) { state.results.push(...rows); return rows; },
    async findExistingLeads() { return state.existing; },
    async createLead(values) {
      const lead = { id: `lead-${state.leads.length + 1}`, ...values };
      state.leads.push(lead);
      return lead;
    },
    async createDraft(values) {
      const draft = { id: `draft-${state.drafts.length + 1}`, ...values };
      state.drafts.push(draft);
      return draft;
    },
    async createActivity(values) { state.activities.push(values); return { id: 'activity-1' }; }
  };
}

const openai = {
  async generateStrategies() {
    return { data: { strategies: [
      { query: '골드 EA 개발자', market: '韓國', target_type: 'EA 開發者', reason: 'relevant' },
      { query: 'FX 自動売買 開発者', market: '日本', target_type: 'EA 開發者', reason: 'relevant' }
    ] }, usage: { input_tokens: 100, output_tokens: 100 } };
  },
  async analyzeResults() {
    return { data: { leads: [
      {
        result_url: 'https://x.com/ea_dev',
        profile_url: 'https://x.com/ea_dev',
        name: 'EA Dev',
        handle: '@ea_dev',
        country: '韓國',
        platform: 'X',
        summary: 'Public EA developer profile',
        recent_content: 'MT5 and gold automation',
        pain_points: ['execution'],
        score: 82,
        language: 'ko',
        message: '안녕하세요. 공개 프로필을 보고 연락드렸습니다.'
      }
    ] }, usage: { input_tokens: 200, output_tokens: 100 } };
  }
};

const search = {
  async search({ query }) {
    return [
      { query, title: 'EA Dev', url: 'https://x.com/ea_dev?utm_source=search', content: 'MT5 EA', providerScore: 0.9 },
      { query, title: 'Article', url: 'https://x.com/ea_dev/status/123', content: 'post', providerScore: 0.8 }
    ];
  }
};

test('executeAgent completes the strategy-to-draft pipeline and deduplicates URLs', async () => {
  const repository = fakeRepository();
  const result = await executeAgent({ repository, openai, search, now: () => new Date('2026-07-19T01:00:00Z') });
  assert.equal(result.ok, true);
  assert.equal(result.searchCount, 2);
  assert.equal(result.resultCount, 2);
  assert.equal(result.candidateCount, 1);
  assert.equal(result.newLeadCount, 1);
  assert.equal(result.draftCount, 1);
  assert.equal(repository.state.results.length, 2);
  assert.equal(repository.state.leads[0].stage, '待審核');
  assert.equal(repository.state.drafts[0].status, 'pending_approval');
  assert.equal(repository.state.activities.length, 1);
  assert.equal(repository.state.runs[0].status, 'completed');
});

test('executeAgent skips an existing account', async () => {
  const repository = fakeRepository({ existing: [{
    id: 'old', profile_url: 'https://x.com/ea_dev', account_key: 'x:ea_dev'
  }] });
  const result = await executeAgent({ repository, openai, search, now: () => new Date('2026-07-19T01:00:00Z') });
  assert.equal(result.newLeadCount, 0);
  assert.equal(repository.state.drafts.length, 0);
});

test('executeAgent records a failed run when the daily search limit is reached', async () => {
  const repository = fakeRepository({ usage: { searchCount: 2, costUsd: 0.1 } });
  await assert.rejects(
    executeAgent({ repository, openai, search, now: () => new Date('2026-07-19T01:00:00Z') }),
    /Daily search limit reached/
  );
  assert.equal(repository.state.runs[0].status, 'failed');
  assert.match(repository.state.runs[0].error_message, /Daily search limit reached/);
});

test('executeAgent persists clear provider failure logs when all searches fail', async () => {
  const repository = fakeRepository();
  const failingSearch = {
    async search() {
      const error = new Error('HTTP 429');
      error.provider = 'Tavily';
      error.status = 429;
      throw error;
    }
  };
  await assert.rejects(
    executeAgent({
      repository,
      openai,
      search: failingSearch,
      now: () => new Date('2026-07-19T01:00:00Z')
    }),
    /All public-web searches failed/
  );
  const failedRun = repository.state.runs[0];
  assert.equal(failedRun.status, 'failed');
  assert.equal(failedRun.search_count, 2);
  assert.equal(failedRun.logs.filter((entry) => entry.provider === 'Tavily').length, 2);
  assert.equal(failedRun.logs[1].status, 429);
});

test('validated leads support Hong Kong and Macau with Chinese drafts', () => {
  const candidate = {
    canonicalUrl: 'https://example.hk/trader', title: 'HK Trader', content: 'MT5 社群',
    query: '香港 MT5 社群', market: '香港', platform: 'Website'
  };
  const leads = validatedLeads({ leads: [{
    result_url: candidate.canonicalUrl,
    profile_url: candidate.canonicalUrl,
    name: 'HK Trader', handle: 'hk-trader', country: '香港', platform: 'Website',
    summary: '香港交易社群', score: 80, language: 'zh', message: '你好，想先認識一下。'
  }] }, [candidate], 55);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].country, '香港');
  assert.equal(leads[0].message_language, 'zh');
});
