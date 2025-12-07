// src/lib/user.ts
import { createClient } from "./supabaseServer";

/**
 * Gondoskodik róla, hogy a megadott fid-hez létezzen user + user_stats sor.
 */
export async function ensureUser(fid: number): Promise<void> {
  const supabase = createClient();

  // --- USERS ---
  const { data: userRows, error: userError } = await supabase
    .from("users")
    .select("fid")
    .eq("fid", fid)
    .limit(1);

  if (userError) {
    console.error("ensureUser: users select error", userError);
  }

  const user = userRows?.[0] ?? null;

  if (!user) {
    const { error: insertUserError } = await supabase.from("users").insert({
      fid,
      // username, pfp_url-t később is frissíthetjük, ha akarjuk
    });

    if (insertUserError) {
      console.error("ensureUser: users insert error", insertUserError);
    }
  }

  // --- USER_STATS ---
  const { data: statsRows, error: statsError } = await supabase
    .from("user_stats")
    .select("fid")
    .eq("fid", fid)
    .limit(1);

  if (statsError) {
    console.error("ensureUser: user_stats select error", statsError);
  }

  const stats = statsRows?.[0] ?? null;

  if (!stats) {
    const { error: insertStatsError } = await supabase
      .from("user_stats")
      .insert({
        fid,
        total_points: 0,
        free_picks_remaining: 0,
        extra_picks_balance: 0,
        next_free_pick_at: null,
        common_opens: 0,
        rare_opens: 0,
        epic_opens: 0,
        legendary_opens: 0,
      });

    if (insertStatsError) {
      console.error("ensureUser: user_stats insert error", insertStatsError);
    }
  }
}

/**
 * Napi ingyenes nyitások száma rank alapján.
 *
 * BOX Based:    isPro=false, isOg=false -> 1
 * BOX OG:       isPro=false, isOg=true  -> 1 + 2 = 3
 * BOX PRO:      isPro=true,  isOg=false -> 2
 * BOX PRO OG:   isPro=true,  isOg=true  -> 2 + 2 = 4
 */
export function getDailyFreePicks(isOg: boolean, isPro: boolean): number {
  let base = isPro ? 2 : 1; // BASED vs PRO
  if (isOg) {
    base += 2; // OG buff
  }
  return base;
}
