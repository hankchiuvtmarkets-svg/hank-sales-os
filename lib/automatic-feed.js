import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decryptFeed } from '../scripts/auto-feed-crypto.js';

const CONTINUOUS_FEED_URL = 'https://raw.githubusercontent.com/hankchiuvtmarkets-svg/hank-sales-os/main/data/auto-leads.json';

export function automaticFeedPath(root = process.cwd()) {
  return join(root, 'data', 'auto-leads.json');
}

export async function loadAutomaticFeed({
  passphrase = process.env.AUTO_FEED_PASSPHRASE,
  inputPath = automaticFeedPath(),
  sourceUrl = process.env.VERCEL ? CONTINUOUS_FEED_URL : ''
} = {}) {
  if (!passphrase) throw new Error('Private lead feed is not configured');
  let payload;
  if (sourceUrl) {
    const response = await fetch(`${sourceUrl}?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Private lead feed request failed: HTTP ${response.status}`);
    payload = await response.json();
  } else {
    payload = JSON.parse(await readFile(inputPath, 'utf8'));
  }
  const feed = payload.ciphertext ? await decryptFeed(payload, passphrase) : payload;
  if (!Array.isArray(feed?.leads)) throw new Error('Private lead feed is invalid');
  return feed;
}
