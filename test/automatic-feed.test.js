import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadAutomaticFeed } from '../lib/automatic-feed.js';
import { encryptFeed } from '../scripts/auto-feed-crypto.js';

test('loads and decrypts the private automatic feed on the server', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hank-feed-'));
  const inputPath = join(directory, 'auto-leads.json');
  const passphrase = 'test-passphrase-with-32-characters';
  const source = { generated_at: '2026-07-20T00:00:00Z', leads: [{ id: 'lead-1' }] };
  try {
    await writeFile(inputPath, JSON.stringify(await encryptFeed(source, passphrase)));
    assert.deepEqual(await loadAutomaticFeed({ passphrase, inputPath }), source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects an unconfigured private automatic feed', async () => {
  await assert.rejects(loadAutomaticFeed({ passphrase: '', inputPath: 'unused' }), {
    message: 'Private lead feed is not configured'
  });
});

test('loads the current encrypted feed from a remote source', async () => {
  const passphrase = 'test-passphrase-with-32-characters';
  const source = { generated_at: '2026-07-20T00:00:00Z', leads: [{ id: 'remote-1' }] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => encryptFeed(source, passphrase)
  });
  try {
    assert.deepEqual(await loadAutomaticFeed({
      passphrase,
      sourceUrl: 'https://example.test/encrypted-feed.json'
    }), source);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
