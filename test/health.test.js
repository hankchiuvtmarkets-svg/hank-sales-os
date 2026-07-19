import test from 'node:test';
import assert from 'node:assert/strict';
import { healthCheck } from '../api/health.js';
import { databaseErrorMessage } from '../lib/repository.js';

test('healthCheck reads agent_settings and reports configuration without secrets', async () => {
  const result = await healthCheck({
    repository: { async countAgentSettings() { return 1; } },
    environment: {
      SUPABASE_URL: 'set',
      SUPABASE_SERVICE_ROLE_KEY: 'set',
      OPENAI_API_KEY: 'set',
      TAVILY_API_KEY: 'set',
      CRON_SECRET: 'set',
      APP_URL: 'set',
      DASHBOARD_TOKEN: 'set'
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.agentSettingsRows, 1);
  assert.equal(Object.values(result.configured).every(Boolean), true);
  assert.equal(JSON.stringify(result).includes('SERVICE_ROLE_KEY'), false);
});

test('database errors remain readable even when Supabase returns a string or details only', () => {
  assert.equal(databaseErrorMessage('permission denied for table leads'), 'permission denied for table leads');
  assert.equal(databaseErrorMessage({ details: 'RLS blocked request', code: '42501' }), 'RLS blocked request | 42501');
});
