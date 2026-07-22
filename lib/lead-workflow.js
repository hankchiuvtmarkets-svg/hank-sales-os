function cleanText(value, maxLength = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function workflowPayload(body = {}) {
  const lead = body.lead && typeof body.lead === 'object' ? body.lead : {};
  let profileUrl;
  try {
    profileUrl = new URL(cleanText(lead.profile_url, 2000));
  } catch {
    throw new Error('A valid public profile URL is required');
  }
  if (profileUrl.protocol !== 'https:') throw new Error('Profile URL must use HTTPS');
  const handle = cleanText(lead.handle, 500);
  const platform = cleanText(lead.platform, 100) || 'Website';
  const normalizedHandle = handle.replace(/^@/, '').toLowerCase();
  const followed = body.followed === true;
  return {
    followed,
    lead: {
      name: cleanText(lead.name, 500) || handle || '未命名客戶',
      handle,
      normalized_handle: normalizedHandle || null,
      account_key: normalizedHandle ? `${platform.toLowerCase()}:${normalizedHandle}` : null,
      profile_url: profileUrl.toString(),
      country: cleanText(lead.country, 100) || '其他',
      platform,
      summary: cleanText(lead.summary),
      recent_content: cleanText(lead.recent_content),
      pain_points: Array.isArray(lead.pain_points) ? lead.pain_points.slice(0, 20).map(item => cleanText(item, 500)).filter(Boolean) : [],
      score: Math.min(100, Math.max(0, Number(lead.score) || 0)),
      suggested_message: cleanText(lead.suggested_message),
      message_language: cleanText(lead.message_language, 20) || 'zh'
    }
  };
}
