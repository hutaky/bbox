import { supabaseServer } from "./supabaseServer";
import { getDailyFreePicks } from "./gameLogic";

export async function ensureUser(
  fid: number,
  username?: string | null,
  pfpUrl?: string | null
) {
  const { data: existing } = await supabaseServer
    .from("users")
    .select("*")
    .eq("fid", fid)
    .maybeSingle();

  if (!existing) {
    const { data: inserted } = await supabaseServer
      .from("users")
      .insert({
        fid,
        username,
        pfp_url: pfpUrl
      })
      .select("*")
      .single();

    await supabaseServer.from("user_stats").insert({
      fid,
      total_points: 0,
      free_picks_remaining: 0,
      extra_picks_balance: 0
    });

    return inserted;
  }

  return existing;
}

export async function getUserState(fid: number) {
  const { data: user } = await supabaseServer
    .from("users")
    .select("*")
    .eq("fid", fid)
    .single();

  const { data: stats } = await supabaseServer
    .from("user_stats")
    .select("*")
    .eq("fid", fid)
    .single();

  return { user, stats };
}

export async function refreshFreePicksIfNeeded(fid: number) {
  const { data: user } = await supabaseServer
    .from("users")
    .select("is_og")
    .eq("fid", fid)
    .single();

  const { data: stats } = await supabaseServer
    .from("user_stats")
    .select("*")
    .eq("fid", fid)
    .single();

  const now = new Date();

  if (
    stats &&
    stats.next_free_refill_at &&
    new Date(stats.next_free_refill_at) <= now &&
    stats.free_picks_remaining === 0
  ) {
    const freePicks = getDailyFreePicks(user.is_og);
    const { data: updated } = await supabaseServer
      .from("user_stats")
      .update({
        free_picks_remaining: freePicks,
        next_free_refill_at: null,
        updated_at: now.toISOString()
      })
      .eq("fid", fid)
      .select("*")
      .single();

    return { user, stats: updated };
  }

  return { user, stats };
}
