const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'ref', 'ref_src', 'source'
]);

const ARTICLE_SEGMENTS = new Set([
  'article', 'articles', 'blog', 'blogs', 'entry', 'news', 'post', 'posts',
  'reel', 'reels', 'shorts', 'status', 'story', 'stories', 'watch'
]);

const SEARCH_SEGMENTS = new Set(['explore', 'hashtag', 'search', 'results', 'tag', 'tags']);

export function canonicalizeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function normalizeHandle(value) {
  if (!value) return '';
  return String(value)
    .trim()
    .replace(/^https?:\/\/(?:www\.)?/, '')
    .replace(/^@/, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

export function detectPlatform(value) {
  const host = (() => {
    try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
  })();
  if (host === 'x.com' || host === 'twitter.com') return 'X';
  if (host.endsWith('threads.net')) return 'Threads';
  if (host.endsWith('instagram.com')) return 'Instagram';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'YouTube';
  if (host.endsWith('naver.com')) return 'Naver';
  if (host.endsWith('tiktok.com')) return 'TikTok';
  if (host === 't.me' || host.endsWith('telegram.me')) return 'Telegram';
  if (host.endsWith('discord.com') || host === 'discord.gg') return 'Discord';
  return host ? 'Website' : '其他';
}

function pathParts(value) {
  try {
    return new URL(value).pathname.split('/').filter(Boolean).map((part) => part.toLowerCase());
  } catch {
    return [];
  }
}

export function candidateUrlDecision(value) {
  const canonicalUrl = canonicalizeUrl(value);
  if (!canonicalUrl) return { candidate: false, reason: 'invalid_url', canonicalUrl: '' };

  const platform = detectPlatform(canonicalUrl);
  const parts = pathParts(canonicalUrl);
  if (parts.some((part) => SEARCH_SEGMENTS.has(part))) {
    return { candidate: false, reason: 'search_or_tag_page', canonicalUrl, platform };
  }
  if (parts.some((part) => ARTICLE_SEGMENTS.has(part))) {
    return { candidate: false, reason: 'article_or_content_page', canonicalUrl, platform };
  }

  if (platform === 'X' && (parts.length !== 1 || parts[0] === 'i')) {
    return { candidate: false, reason: 'not_x_profile', canonicalUrl, platform };
  }
  if (platform === 'Instagram' && parts.length !== 1) {
    return { candidate: false, reason: 'not_instagram_profile', canonicalUrl, platform };
  }
  if (platform === 'Threads' && (parts.length !== 1 || !parts[0].startsWith('@'))) {
    return { candidate: false, reason: 'not_threads_profile', canonicalUrl, platform };
  }
  if (platform === 'TikTok' && (parts.length !== 1 || !parts[0].startsWith('@'))) {
    return { candidate: false, reason: 'not_tiktok_profile', canonicalUrl, platform };
  }
  if (platform === 'YouTube' && !(
    parts.length === 1 && (parts[0].startsWith('@') || ['channel', 'c', 'user'].includes(parts[0]))
  ) && !(parts.length === 2 && ['channel', 'c', 'user'].includes(parts[0]))) {
    return { candidate: false, reason: 'not_youtube_channel', canonicalUrl, platform };
  }
  if (platform === 'Naver' && parts.length > 2) {
    return { candidate: false, reason: 'naver_article_page', canonicalUrl, platform };
  }
  if (platform === 'Telegram' && parts.length !== 1) {
    return { candidate: false, reason: 'not_telegram_channel', canonicalUrl, platform };
  }
  if (platform === 'Discord') {
    return { candidate: false, reason: 'discord_invite_not_public_profile', canonicalUrl, platform };
  }
  if (platform === 'Website' && parts.length > 1) {
    return { candidate: false, reason: 'website_article_page', canonicalUrl, platform };
  }

  return { candidate: true, reason: null, canonicalUrl, platform };
}

export function deduplicateResults(results) {
  const seen = new Set();
  const unique = [];
  for (const result of results) {
    const decision = candidateUrlDecision(result.url);
    if (!decision.canonicalUrl || seen.has(decision.canonicalUrl)) continue;
    seen.add(decision.canonicalUrl);
    unique.push({ ...result, ...decision });
  }
  return unique;
}

export function sameAccountKey({ platform, handle, profile_url: profileUrl }) {
  const normalized = normalizeHandle(handle || profileUrl);
  return normalized ? `${String(platform || detectPlatform(profileUrl)).toLowerCase()}:${normalized}` : '';
}
