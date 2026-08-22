// Optional Supabase client.
// The app runs fully on Vercel serverless routes (/api/*). Supabase is only a
// fallback, so when the env vars are absent we export `null` instead of
// throwing at import time (which used to blank-screen the whole app).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
