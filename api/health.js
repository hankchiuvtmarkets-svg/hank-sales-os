import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return res.status(500).json({ ok: false, error: 'Missing Supabase environment variables' });
    }

    const db = createClient(url, key, { auth: { persistSession: false } });
    const { count, error } = await db
      .from('agent_settings')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      database: 'connected',
      agentSettingsRows: count ?? 0
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
