import assert from 'node:assert/strict';
import test from 'node:test';
import { workflowPayload } from '../lib/lead-workflow.js';

test('workflowPayload normalizes safe automatic lead data', () => {
  const result = workflowPayload({
    followed: true,
    lead: {
      name: ' Example ',
      handle: '@Example',
      profile_url: 'https://example.com/profile',
      country: '香港',
      platform: 'Website',
      score: 88,
      pain_points: ['執行成本', '合作轉換']
    }
  });
  assert.equal(result.followed, true);
  assert.equal(result.lead.name, 'Example');
  assert.equal(result.lead.normalized_handle, 'example');
  assert.equal(result.lead.account_key, 'website:example');
  assert.equal(result.lead.score, 88);
});

test('workflowPayload rejects non-public profile URLs', () => {
  assert.throws(
    () => workflowPayload({ lead: { profile_url: 'http://example.com/private' } }),
    /HTTPS/
  );
  assert.throws(
    () => workflowPayload({ lead: { profile_url: 'not-a-url' } }),
    /valid public profile URL/
  );
});
