import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let configuration = {};
try {
  configuration = await import('./config.js');
} catch {
  console.info('Harbour North is running in local alpha mode. Add app/js/config.js to enable accounts and cloud save.');
}

const url = configuration.SUPABASE_URL || '';
const key = configuration.SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured =
  /^https:\/\/.+\.supabase\.co$/i.test(url) &&
  key.length > 20 &&
  !url.includes('YOUR_PROJECT') &&
  !key.includes('YOUR_SUPABASE');

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;
