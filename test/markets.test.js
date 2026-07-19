import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_AGENT_SETTINGS } from '../lib/config.js';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('Japan, Korea, Hong Kong and Macau are first-class search markets', () => {
  assert.deepEqual(DEFAULT_AGENT_SETTINGS.targetMarkets, ['韓國', '日本', '香港', '澳門']);
  assert.match(index, /\['全部','日本','韓國','香港','澳門'\]/);
  assert.match(index, /option value="hk">香港/);
  assert.match(index, /option value="mo">澳門/);
  assert.match(schema, /\["韓國", "日本", "香港", "澳門"\]/);
});
