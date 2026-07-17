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
    const db = dbClient();
    const [{ data: runs, error: runError }, { count, error: countError }] = await Promise.all([
      db.from('search_runs').select('*').order('started_at', { ascending: false }).limit(10),
      db.from('leads').select('*', { count: 'exact', head: true })
    ]);

    if (runError) throw runError;
    if (countError) throw countError;

    return res.status(200).json({
      ok: true,
      configured: {
        supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
        search: Boolean(process.env.TAVILY_API_KEY),
        cron: Boolean(process.env.CRON_SECRET)
      },
      leadCount: count || 0,
      recentRuns: runs || []
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
