import { createClient } from '@supabase/supabase-js';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';

function supabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      input: prompt
    })
  });

  if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
  const data = await response.json();
  return data.output_text || '';
}

function extractJson(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < 0) throw new Error('AI did not return a JSON array');
  return JSON.parse(text.slice(start, end + 1));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const market = req.body?.market || '韓國與日本';
    const target = req.body?.target || 'EA開發者、交易社群主、IB與金融內容創作者';
    const prompt = `你是日韓金融市場陌生開發研究員。請為 ${market} 的 ${target} 產生 12 組可用於公開網頁搜尋的精準搜尋查詢。\n要求：\n1. 韓文與日文為主，必要時加入英文。\n2. 尋找公開帳號、網站、YouTube頻道、Naver部落格、X貼文、Threads頁面。\n3. 優先找近期提到 EA、MT4、MT5、黃金交易、券商、點差、滑價、出金、合作、代理、社群招募的人。\n4. 不要產生大量私訊或繞過平台限制的操作。\n5. 僅輸出 JSON 陣列，每項格式：{"query":"...","market":"韓國或日本","reason":"為什麼值得搜"}`;

    const raw = await callOpenAI(prompt);
    const strategies = extractJson(raw);

    const db = supabaseClient();
    const { error } = await db.from('search_runs').insert({
      market,
      target,
      strategies,
      status: 'planned'
    });
    if (error) throw error;

    return res.status(200).json({ strategies });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
