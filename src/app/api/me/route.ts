// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const fid = body?.fid as number | undefined;

    if (!fid || Number.isNaN(fid)) {
      return NextResponse.json(
        { error: "Missing or invalid fid" },
        { status: 400 }
      );
    }

    // --- USERS ---
    const { data: existingUser, error: userErr } = await supabase
      .from("users")
      .select("*")
      .eq("fid", fid)
      .maybeSingle();

    if (userErr) console.error("users select error:", userErr);

    let userRow = existingUser;

    if (!userRow) {
      const { data: insertedUser, error: insertUserErr } = await supabase
        .from("users")
        .insert({
          fid,
          username: `fid_${fid}`,
          pfp_url: null,
          is_og: false,
        })
        .select()
        .single();

      if (insertUserErr) console.error("users insert error:", insertUserErr);
      else userRow = insertedUser;
    }

    // --- USER_STATS ---
    const { data: existingStats, error: statsErr } = await supabase
      .from("user_stats")
      .select("*")
      .eq("fid", fid)
      .maybeSingle();

    if (statsErr) console.error("user_stats select error:", statsErr);

    let statsRow = existingStats;

    if (!statsRow) {
      const { data: insertedStats, error: insertStatsErr } = await supabase
        .from("user_stats")
        .insert({
          fid,
          total_points: 0,
          free_picks_remaining: 1,
          extra_picks_remaining: 0,
          next_free_pick_at: null,
          common_opens: 0,
          rare_opens: 0,
          epic_opens: 0,
          legendary_opens: 0,
          last_rarity: null,
          last_points: null,
          last_opened_at: null,
        })
        .select()
        .single();

      if (insertStatsErr) console.error("user_stats insert error:", insertStatsErr);
      else statsRow = insertedStats;
    }

    let lastResult = null as
      | {
          rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
          points: number;
          openedAt: string;
        }
      | null;

    if (statsRow?.last_rarity) {
      lastResult = {
        rarity: statsRow.last_rarity,
        points: statsRow.last_points ?? 0,
        openedAt:
          statsRow.last_opened_at ?? new Date().toISOString(),
      };
    }

    return NextResponse.json({
      fid,
      username: userRow?.username ?? `fid_${fid}`,
      pfpUrl: userRow?.pfp_url ?? null,
      isOg: userRow?.is_og ?? false,

      totalPoints: statsRow?.total_points ?? 0,
      freePicksRemaining: statsRow?.free_picks_remaining ?? 0,
      extraPicksRemaining: statsRow?.extra_picks_remaining ?? 0,
      nextFreePickAt: statsRow?.next_free_pick_at,

      commonOpens: statsRow?.common_opens ?? 0,
      rareOpens: statsRow?.rare_opens ?? 0,
      epicOpens: statsRow?.epic_opens ?? 0,
      legendaryOpens: statsRow?.legendary_opens ?? 0,

      lastResult,
    });
  } catch (err) {
    console.error("Error in /api/me:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
