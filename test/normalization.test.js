import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateUrlDecision,
  canonicalizeUrl,
  deduplicateResults,
  normalizeHandle,
  sameAccountKey
} from '../lib/normalization.js';

test('canonicalizeUrl removes tracking, fragments, www and trailing slash', () => {
  assert.equal(
    canonicalizeUrl('http://www.X.com/EA_dev/?utm_source=test&ref=feed#top'),
    'https://x.com/EA_dev'
  );
});

test('candidate URL filtering keeps profiles and rejects articles/search pages', () => {
  assert.equal(candidateUrlDecision('https://x.com/ea_dev').candidate, true);
  assert.equal(candidateUrlDecision('https://x.com/ea_dev/status/123').reason, 'article_or_content_page');
  assert.equal(candidateUrlDecision('https://instagram.com/ea_dev/reel/123').candidate, false);
  assert.equal(candidateUrlDecision('https://youtube.com/@ea-channel').candidate, true);
  assert.equal(candidateUrlDecision('https://example.com/blog/new-ea').candidate, false);
});

test('results and account keys are normalized for deduplication', () => {
  const results = deduplicateResults([
    { url: 'https://x.com/EA_dev?utm_source=a', title: 'one' },
    { url: 'https://www.x.com/EA_dev/', title: 'duplicate' }
  ]);
  assert.equal(results.length, 1);
  assert.equal(normalizeHandle('@EA_Dev'), 'ea_dev');
  assert.equal(
    sameAccountKey({ platform: 'X', handle: '@EA_Dev' }),
    'x:ea_dev'
  );
});
