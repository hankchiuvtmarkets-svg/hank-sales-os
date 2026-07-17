import { createClient } from '@supabase/supabase-js';

function dbClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const db = dbClient();
    const { data, error } = await db
      .from('leads')
      .select('*')
      .order('total_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return res.status(200).json({ leads: data || [] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
