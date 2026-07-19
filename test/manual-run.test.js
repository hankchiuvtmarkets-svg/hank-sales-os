import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/manual-run.js';

function responseRecorder() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    setHeader() {}
  };
}

test('manual run falls back to the safe schedule when provider keys are unavailable', async () => {
  const previous = process.env.DASHBOARD_TOKEN;
  process.env.DASHBOARD_TOKEN = 'test-login';
  const res = responseRecorder();
  try {
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-login' } }, res);
  } finally {
    if (previous === undefined) delete process.env.DASHBOARD_TOKEN;
    else process.env.DASHBOARD_TOKEN = previous;
  }
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.mode, 'scheduled_fallback');
  assert.equal(res.payload.immediateRunAvailable, false);
});
