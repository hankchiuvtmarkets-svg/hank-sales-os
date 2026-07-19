import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const automaticFeed = JSON.parse(await readFile(new URL('../data/auto-leads.json', import.meta.url), 'utf8'));

test('schema contains every table used by the backend', () => {
  for (const table of ['agent_settings', 'search_runs', 'search_results', 'leads', 'message_drafts', 'activities']) {
    assert.match(schema, new RegExp(`create table if not exists public\\.${table}`));
  }
});

test('keyless automatic lead feed has a stable frontend contract', () => {
  assert.equal('generated_at' in automaticFeed, true);
  assert.equal(typeof automaticFeed.strategy_summary, 'string');
  assert.equal(Array.isArray(automaticFeed.leads), true);
});

test('schema contains status, cost, deduplication and dashboard fields', () => {
  for (const column of [
    'started_at', 'result_count', 'candidate_count', 'new_lead_count', 'draft_count',
    'search_count', 'estimated_cost_usd', 'error_message', 'logs', 'canonical_url',
    'account_key', 'pending_approval'
  ]) {
    assert.equal(schema.includes(column), true, `missing schema field: ${column}`);
  }
});
