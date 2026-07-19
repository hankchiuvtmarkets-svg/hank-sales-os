import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorized, requireDashboardAuthorized } from '../lib/server.js';

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('cron authorization compares the bearer token', () => {
  assert.equal(isAuthorized(
    { headers: { authorization: 'Bearer correct' } },
    { CRON_SECRET: 'correct' }
  ), true);
  assert.equal(isAuthorized(
    { headers: { authorization: 'Bearer wrong' } },
    { CRON_SECRET: 'correct' }
  ), false);
});

test('dashboard APIs fail closed when DASHBOARD_TOKEN is missing', () => {
  const res = responseRecorder();
  assert.equal(requireDashboardAuthorized({ headers: {} }, res, {}), false);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error, 'Missing DASHBOARD_TOKEN');
});
