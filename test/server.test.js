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

test('cloud CRM APIs fail closed when server-side login is missing', () => {
  const res = responseRecorder();
  assert.equal(requireDashboardAuthorized({ headers: {} }, res, {}), false);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error, 'Cloud CRM login is not configured');
});

test('cloud CRM APIs accept requests behind the private Vercel site', () => {
  const res = responseRecorder();
  assert.equal(requireDashboardAuthorized({ headers: {} }, res, {
    VERCEL_PRIVATE_SITE: 'true'
  }), true);
  assert.equal(res.statusCode, null);
});
