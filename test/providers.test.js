import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonResponse } from '../lib/providers.js';

test('parseJsonResponse accepts fenced JSON and surrounding explanation', () => {
  assert.deepEqual(parseJsonResponse('```json\n{"strategies":[]}\n```'), { strategies: [] });
  assert.deepEqual(parseJsonResponse('Result:\n[{"query":"EA"}]\nDone'), [{ query: 'EA' }]);
});

test('parseJsonResponse rejects incomplete output', () => {
  assert.throws(() => parseJsonResponse('not json'), /did not contain JSON/);
});
