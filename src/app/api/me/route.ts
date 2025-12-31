// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = { fid: number; username?: string | null; pfpUrl?: string | null };

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;

    if (!fid || !Number.isFinite(fid)) {
      return NextResponse.json({ error: "Missing fid" }, { status: 400 });
    }

    const username = body?.username ?? null;
    const pfpUrl = body?.pfpUrl ?? null;

    // --- ensure user row exists ---
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .upsert(
        {
          fid,
          username,
          pfp_url: pfpUrl,
        },
        { onConflict: "fid" }
      )
      .select("fid, username, pfp_url, is_og, is_pro")
      .single();

    if (userErr || !userRow) {
      console.error("users upsert/select error:", userErr);
      return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
    }

    const isOg = Boolean(userRow.is_og);

    // --- ensure stats row exists ---
    const { data: stats0, error: statsErr0 } = await supabase
      .from("user_stats")
      .select(
        [
          "fid",
          "total_points",
          "free_picks_remaining",
          "extra_picks_remaining",
          "next_free_pick_at",
          "common_opens",
          "rare_opens",
          "epic_opens",
          "legendary_opens",
          "last_rarity",
          "last_points",
          "last_opened_at",
        ].join(",")
      )
      .eq("fid", fid)
      .maybeSingle();

    if (statsErr0) {
      console.error("user_stats select error:", statsErr0);
      return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
    }

    if (!stats0) {
      // First time: grant today's picks immediately
      const now = new Date();
      const dailyFree = isOg ? 2 : 1;

      const { data: inserted, error: insErr } = await supabase
        .from("user_stats")
        .insert({
          fid,
          total_points: 0,
          free_picks_remaining: dailyFree,
          extra_picks_remaining: 0,
          next_free_pick_at: addHours(now, 24).toISOString(),
          common_opens: 0,
          rare_opens: 0,
          epic_opens: 0,
          legendary_opens: 0,
          last_rarity: null,
          last_points: null,
          last_opened_at: null,
        })
        .select("*")
        .single();

      if (insErr || !inserted) {
        console.error("user_stats insert error:", insErr);
        return NextResponse.json({ error: "Failed to create stats" }, { status: 500 });
      }

      return NextResponse.json({
        fid,
        username: userRow.username,
        pfpUrl: userRow.pfp_url,
        isOg: userRow.is_og,
        isPro: userRow.is_pro,
        totalPoints: inserted.total_points,
        freePicksRemaining: inserted.free_picks_remaining,
        extraPicksRemaining: inserted.extra_picks_remaining,
        nextFreePickAt: inserted.next_free_pick_at,
        commonOpens: inserted.common_opens,
        rareOpens: inserted.rare_opens,
        epicOpens: inserted.epic_opens,
        legendaryOpens: inserted.legendary_opens,
        lastResult: inserted.last_rarity
          ? { rarity: inserted.last_rarity, points: inserted.last_points, openedAt: inserted.last_opened_at }
          : null,
      });
    }

    // Existing stats: check if daily reset is due
    const now = new Date();
    const nextFreeAt = stats0.next_free_pick_at ? new Date(stats0.next_free_pick_at) : null;

    let freePicksRemaining = Number(stats0.free_picks_remaining ?? 0);
    let nextFreePickAt = stats0.next_free_pick_at ?? null;

    const dailyFree = isOg ? 2 : 1;

    // If timer passed and user has no free picks left, refresh for the day
    if ((!nextFreeAt || nextFreeAt.getTime() <= now.getTime()) && freePicksRemaining <= 0) {
      freePicksRemaining = dailyFree;
      nextFreePickAt = addHours(now, 24).toISOString();

      const { error: updErr } = await supabase
        .from("user_stats")
        .update({
          free_picks_remaining: freePicksRemaining,
          next_free_pick_at: nextFreePickAt,
          updated_at: new Date().toISOString(),
        })
        .eq("fid", fid);

      if (updErr) {
        console.error("user_stats daily refresh update error:", updErr);
        return NextResponse.json({ error: "Failed to refresh daily picks" }, { status: 500 });
      }
    }

    return NextResponse.json({
      fid,
      username: userRow.username,
      pfpUrl: userRow.pfp_url,
      isOg: userRow.is_og,
      isPro: userRow.is_pro,
      totalPoints: Number(stats0.total_points ?? 0),
      freePicksRemaining,
      extraPicksRemaining: Number(stats0.extra_picks_remaining ?? 0),
      nextFreePickAt,
      commonOpens: Number(stats0.common_opens ?? 0),
      rareOpens: Number(stats0.rare_opens ?? 0),
      epicOpens: Number(stats0.epic_opens ?? 0),
      legendaryOpens: Number(stats0.legendary_opens ?? 0),
      lastResult: stats0.last_rarity
        ? { rarity: stats0.last_rarity, points: stats0.last_points, openedAt: stats0.last_opened_at }
        : null,
    });
  } catch (e: any) {
    console.error("Error in /api/me:", e);
    return NextResponse.json(
      { error: "Internal server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
