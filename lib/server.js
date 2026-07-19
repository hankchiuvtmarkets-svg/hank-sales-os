import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { requireSettings } from './config.js';
import { createSupabaseRepository } from './repository.js';

export function createRepository(environment = process.env) {
  requireSettings(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], environment);
  const db = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return createSupabaseRepository(db);
}

export function isAuthorized(req, environment = process.env) {
  return hasBearerToken(req, environment.CRON_SECRET);
}

function hasBearerToken(req, secret) {
  if (!secret) return false;
  const header = Array.isArray(req.headers?.authorization)
    ? req.headers.authorization[0]
    : req.headers?.authorization;
  const supplied = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice(7)
    : '';
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function requireAuthorized(req, res, environment = process.env) {
  if (isAuthorized(req, environment)) return true;
  res.status(401).json({ ok: false, error: 'Unauthorized' });
  return false;
}

export function requireDashboardAuthorized(req, res, environment = process.env) {
  if (!environment.DASHBOARD_TOKEN) {
    res.status(503).json({ ok: false, error: 'Missing DASHBOARD_TOKEN' });
    return false;
  }
  if (hasBearerToken(req, environment.DASHBOARD_TOKEN)) return true;
  res.status(401).json({ ok: false, error: 'Dashboard authorization required' });
  return false;
}

export function sendMethodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}

export function safeErrorResponse(error) {
  return { ok: false, error: error.message || 'Unexpected server error' };
}
