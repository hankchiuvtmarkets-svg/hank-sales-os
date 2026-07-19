import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProfileUrl, leadIdentityKeys, mergeAutomaticFeed } from '../scripts/auto-feed-merge.js';

test('automatic feed normalizes profile URLs and account identities', () => {
  assert.equal(canonicalProfileUrl('http://WWW.Example.com/user/?utm_source=x#bio'), 'https://example.com/user');
  assert.deepEqual(leadIdentityKeys({ platform: 'X', handle: '@Trader', profile_url: 'https://x.com/Trader/' }), [
    'url:https://x.com/Trader', 'account:x:trader'
  ]);
});

test('automatic feed keeps a durable seen archive and does not duplicate a person', () => {
  const first = mergeAutomaticFeed({}, [{
    id: 'one', name: 'Trader', platform: 'X', handle: '@Trader',
    profile_url: 'https://x.com/Trader', score: 80
  }], { now: '2026-07-19T00:00:00Z', run: { queries: ['first'] } });
  const second = mergeAutomaticFeed(first, [{
    id: 'different-id', name: 'Trader updated', platform: 'x', handle: 'trader',
    profile_url: 'https://www.x.com/Trader/?utm_source=search', score: 91
  }], { now: '2026-07-20T00:00:00Z', run: { queries: ['second'] } });

  assert.equal(second.leads.length, 1);
  assert.equal(second.seen_entities.length, 1);
  assert.equal(second.leads[0].name, 'Trader updated');
  assert.equal(second.leads[0].first_seen, '2026-07-19T00:00:00Z');
  assert.equal(second.leads[0].last_seen, '2026-07-20T00:00:00Z');
  assert.equal(second.leads[0].times_seen, 2);
  assert.equal(second.tracking_summary.new_this_run, 0);
  assert.equal(second.tracking_summary.duplicates_this_run, 1);
  assert.equal(second.search_history.length, 2);
});

test('automatic feed retains seen entities even when the visible lead list is capped', () => {
  const feed = mergeAutomaticFeed({}, [
    { id: 'one', profile_url: 'https://example.com/one', score: 90 },
    { id: 'two', profile_url: 'https://example.com/two', score: 70 }
  ], { now: '2026-07-19T00:00:00Z', maxLeads: 1 });
  assert.equal(feed.leads.length, 1);
  assert.equal(feed.seen_entities.length, 2);
  assert.equal(feed.tracking_summary.total_seen, 2);
});
