import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptFeed, encryptFeed } from '../scripts/auto-feed-crypto.js';

test('automatic lead feed encryption round-trips without exposing lead data', async () => {
  const feed = { generated_at: '2026-07-19T00:00:00Z', leads: [{ handle: '@private-target' }] };
  const encrypted = await encryptFeed(feed, 'test-passphrase-with-32-characters');
  assert.equal(JSON.stringify(encrypted).includes('@private-target'), false);
  assert.deepEqual(await decryptFeed(encrypted, 'test-passphrase-with-32-characters'), feed);
  await assert.rejects(decryptFeed(encrypted, 'wrong-passphrase-long-enough'));
});
