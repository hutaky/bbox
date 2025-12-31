import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase Admin client (Service Role).
 * Ne használd kliens oldalon!
 */
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL as fallback)."
  );
}

if (!serviceRoleKey) {
  throw new Error(
    "Missing env: SUPABASE_SERVICE_ROLE_KEY (server-only, Vercelben is add hozzá)."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
