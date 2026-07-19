const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const TAVILY_API_URL = 'https://api.tavily.com/search';

export class ProviderError extends Error {
  constructor(provider, message, { status = null, operation = null } = {}) {
    super(`${provider}: ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
    this.operation = operation;
  }
}

function responseText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

export function parseJsonResponse(text) {
  if (typeof text !== 'string') throw new Error('AI response is not text');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const objectStart = cleaned.indexOf('{');
  const arrayStart = cleaned.indexOf('[');
  const start = [objectStart, arrayStart].filter((value) => value >= 0).sort((a, b) => a - b)[0];
  if (start === undefined) throw new Error('AI response did not contain JSON');
  const opener = cleaned[start];
  const end = opener === '{' ? cleaned.lastIndexOf('}') : cleaned.lastIndexOf(']');
  if (end < start) throw new Error('AI response contained incomplete JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function createOpenAIClient({ apiKey, model = 'gpt-5-mini', fetchImpl = fetch }) {
  async function request(prompt, operation) {
    if (!apiKey) throw new ProviderError('OpenAI', 'Missing OPENAI_API_KEY', { operation });
    let response;
    try {
      response = await fetchImpl(OPENAI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          input: prompt,
          max_output_tokens: Math.min(
            Math.max(Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 2000), 200),
            5000
          )
        })
      });
    } catch (error) {
      throw new ProviderError('OpenAI', error.message, { operation });
    }
    if (!response.ok) {
      const requestId = response.headers?.get?.('x-request-id');
      throw new ProviderError(
        'OpenAI',
        `HTTP ${response.status}${requestId ? ` (request ${requestId})` : ''}`,
        { status: response.status, operation }
      );
    }
    const payload = await response.json();
    const text = responseText(payload);
    if (!text) throw new ProviderError('OpenAI', 'empty response', { operation });
    return { data: parseJsonResponse(text), usage: payload.usage || null };
  }

  return {
    generateStrategies: async ({ markets, targetTypes, count }) => request(
      `You plan public-web lead research for a single sales professional. Create ${count} precise search queries for ${markets.join(' and ')} targeting ${targetTypes.join(', ')}. Use Korean or Japanese as appropriate and optionally English platform terms. Focus on public profiles, channel homepages and official websites for EA developers, MT4/MT5 creators, trading community owners, IBs and financial creators. Never suggest automated messaging, authentication bypass, scraping private data or platform-rule evasion. Return JSON only as {"strategies":[{"query":"...","market":"韓國 or 日本","target_type":"...","reason":"..."}]}.`,
      'generate_strategies'
    ),
    analyzeResults: async ({ results, minScore }) => request(
      `Analyze these public search results as potential Korean/Japanese trading-industry leads. Use only supplied evidence; do not invent follower counts, contact details or claims. Keep only real people, brands, communities or developer profiles with a cooperation score of at least ${minScore}. Scores are 0-100 and must reflect relevance, activity evidence, likely pain/need, and cooperation fit. Create a natural first-contact draft in Korean or Japanese, but it must remain pending human approval and must not claim you read content not present here. Return JSON only as {"leads":[{"result_url":"exact input URL","name":"...","handle":"...","profile_url":"exact input URL","country":"韓國 or 日本","platform":"X|Threads|Instagram|YouTube|Naver|TikTok|Telegram|Website","summary":"...","recent_content":"...","pain_points":["..."],"score":0,"language":"ko or ja","message":"..."}]}. Results:\n${JSON.stringify(results)}`,
      'analyze_results'
    )
  };
}

export function createTavilyClient({ apiKey, fetchImpl = fetch }) {
  return {
    search: async ({ query, maxResults }) => {
      if (!apiKey) throw new ProviderError('Tavily', 'Missing TAVILY_API_KEY', { operation: 'search' });
      let response;
      try {
        response = await fetchImpl(TAVILY_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: 'advanced',
            max_results: maxResults,
            include_answer: false,
            include_raw_content: false
          })
        });
      } catch (error) {
        throw new ProviderError('Tavily', error.message, { operation: 'search' });
      }
      if (!response.ok) {
        throw new ProviderError('Tavily', `HTTP ${response.status}`, {
          status: response.status,
          operation: 'search'
        });
      }
      const payload = await response.json();
      return (payload.results || []).map((result) => ({
        query,
        title: result.title || '',
        url: result.url || '',
        content: result.content || '',
        providerScore: Number(result.score) || 0,
        rawData: { published_date: result.published_date || null }
      }));
    }
  };
}
