// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { ensureUser } from "@/lib/user";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const fid = body?.fid as number | undefined;

    if (!fid || !Number.isFinite(fid)) {
      return NextResponse.json(
        { error: "Missing or invalid fid" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Gondoskodunk róla, hogy user + stats sor létezzen
    await ensureUser(fid);

    // users tábla: username, pfp_url, is_og
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("fid, username, pfp_url, is_og")
      .eq("fid", fid)
      .maybeSingle();

    if (userErr) {
      console.error("Supabase users fetch error:", userErr);
    }

    // stats tábla: pontok, pickek, box statok
    const { data: statsRow, error: statsErr } = await supabase
      .from("stats")
      .select(
        `
        total_points,
        free_picks_remaining,
        extra_picks_remaining,
        next_free_pick_at,
        common_opens,
        rare_opens,
        epic_opens,
        legendary_opens,
        last_rarity,
        last_points,
        last_opened_at
      `
      )
      .eq("fid", fid)
      .maybeSingle();

    if (statsErr) {
      console.error("Supabase stats fetch error:", statsErr);
    }

    const username = userRow?.username ?? null;
    const pfpUrl = userRow?.pfp_url ?? null;
    const isOg = Boolean(userRow?.is_og);

    const totalPoints = statsRow?.total_points ?? 0;
    const freePicksRemaining = statsRow?.free_picks_remaining ?? 0;
    const extraPicksRemaining = statsRow?.extra_picks_remaining ?? 0;
    const nextFreePickAt = statsRow?.next_free_pick_at ?? null;

    const commonOpens = statsRow?.common_opens ?? 0;
    const rareOpens = statsRow?.rare_opens ?? 0;
    const epicOpens = statsRow?.epic_opens ?? 0;
    const legendaryOpens = statsRow?.legendary_opens ?? 0;

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
          statsRow.last_opened_at ??
          new Date().toISOString(),
      };
    }

    return NextResponse.json({
      fid,
      username,
      pfpUrl,
      isOg,
      totalPoints,
      freePicksRemaining,
      extraPicksRemaining,
      nextFreePickAt,
      commonOpens,
      rareOpens,
      epicOpens,
      legendaryOpens,
      lastResult,
    });
  } catch (error) {
    console.error("Error in /api/me:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
