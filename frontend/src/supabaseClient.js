/**
 * Supabase Client — Frontend
 *
 * Uses the anon/public key (safe for browser).
 * Auth, realtime, and storage access from the frontend.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xlzqvxgusbiqgzxfvbed.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsenF2eGd1c2JpcWd6eGZ2YmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzE2OTYsImV4cCI6MjA5MDgwNzY5Nn0.hR-JszoGWkOaSdz_9odiV8kGi0pi5589CQaWSAoE-SI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
