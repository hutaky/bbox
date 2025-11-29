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
    // új user létrehozása
    const { data: inserted } = await supabaseServer
      .from("users")
      .insert({
        fid,
        username,
        pfp_url: pfpUrl
      })
      .select("*")
      .single();

    // alap user_stats – free_picks egyelőre 0, az első belépéskor kapja meg
    await supabaseServer.from("user_stats").insert({
      fid,
      total_points: 0,
      free_picks_remaining: 0,
      extra_picks_balance: 0,
      next_free_refill_at: null
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

  // 1) Ha még soha nem volt refill (next_free_refill_at = null) ÉS nincs free pick,
  //    akkor ez az első alkalom → adjuk oda a napi free pickeket
  if (!stats.next_free_refill_at && stats.free_picks_remaining === 0) {
    const freePicks = getDailyFreePicks(user.is_og);
    const { data: updated } = await supabaseServer
      .from("user_stats")
      .update({
        free_picks_remaining: freePicks,
        updated_at: now.toISOString()
      })
      .eq("fid", fid)
      .select("*")
      .single();

    return { user, stats: updated };
  }

  // 2) Normál refill logika: ha van next_free_refill_at, és már lejárt, és nincs free pick
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

  // 3) Egyébként marad a jelenlegi állapot
  return { user, stats };
}
