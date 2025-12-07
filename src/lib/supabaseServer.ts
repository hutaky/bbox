// src/lib/supabaseServer.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL for Supabase client");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY for Supabase client"
  );
}

/**
 * Szerver oldali Supabase kliens.
 * API route-okban nyugodtan használhatod – a service role key nem megy ki a kliensre.
 */
export function createClient(): SupabaseClient {
  return createSupabaseClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
}

// Ha szeretnél, használhatod ezt is máshol:
export type SupabaseServerClient = ReturnType<typeof createClient>;
