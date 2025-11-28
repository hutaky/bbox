import { supabaseServer } from "./supabaseServer";
import { getDailyFreePicks } from "./gameLogic";

export async function ensureUser(fid: number, username?: string | null, pfpUrl?: string | null) {
  const { data: existing, error } = await supabaseServer
    .from("users")
    .select("*")
    .eq("fid", fid)
    .maybeSingle();

  if (error) {
    console.error("ensureUser select error", error);
  }

  if (!existing) {
    const { data: inserted, error: insertErr } = await supabaseServer
      .from("users")
      .insert({
        fid,
        username,
        pfp_url: pfpUrl
      })
      .select("*")
      .single();

    if (insertErr) {
      console.error("ensureUser insert error", insertErr);
      throw insertErr;
    }

    const { error: statErr } = await supabaseServer
      .from("user_stats")
      .insert({
        fid,
        total_points: 0,
        free_picks_remaining: 0,
        extra_picks_balance: 0
      });

    if (statErr) {
      console.error("ensureUser user_stats insert error", statErr);
    }

    return inserted;
  }

  return existing;
}

export async function getUserState(fid: number) {
  const { data: user, error: userErr } = await supabaseServer
    .from("users")
    .select("*")
    .eq("fid", fid)
    .single();

  if (userErr) {
    console.error("getUserState user error", userErr);
    throw userErr;
  }

  const { data: stats, error: statsErr } = await supabaseServer
    .from("user_stats")
    .select("*")
    .eq("fid", fid)
    .single();

  if (statsErr) {
    console.error("getUserState stats error", statsErr);
    throw statsErr;
  }

  return { user, stats };
}

export async function refreshFreePicksIfNeeded(fid: number) {
  const { data: user, error: userErr } = await supabaseServer
    .from("users")
    .select("is_og")
    .eq("fid", fid)
    .single();

  if (userErr) {
    console.error("refreshFreePicksIfNeeded user error", userErr);
    throw userErr;
  }

  const { data: stats, error: statsErr } = await supabaseServer
    .from("user_stats")
    .select("*")
    .eq("fid", fid)
    .single();

  if (statsErr) {
    console.error("refreshFreePicksIfNeeded stats error", statsErr);
    throw statsErr;
  }

  const now = new Date();

  if (
    stats &&
    stats.next_free_refill_at &&
    new Date(stats.next_free_refill_at) <= now &&
    stats.free_picks_remaining === 0
  ) {
    const freePicks = getDailyFreePicks(user.is_og);
    const { data: updated, error: updateErr } = await supabaseServer
      .from("user_stats")
      .update({
        free_picks_remaining: freePicks,
        next_free_refill_at: null,
        updated_at: now.toISOString()
      })
      .eq("fid", fid)
      .select("*")
      .single();

    if (updateErr) {
      console.error("refreshFreePicksIfNeeded update error", updateErr);
      throw updateErr;
    }

    return { user, stats: updated };
  }

  return { user, stats };
}
