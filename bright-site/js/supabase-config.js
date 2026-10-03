// Public values only: the project URL and the *publishable* key (sb_publishable_...) are designed to ship to browsers.
// NEVER put a secret key (sb_secret_...), a legacy service_role key, or any LLM provider key in this file.
// See docs/MANUAL_STEPS.md.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';

export const SUPABASE_URL = 'https://iitthgvhxavuwbzcjoqq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YOUR-KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
