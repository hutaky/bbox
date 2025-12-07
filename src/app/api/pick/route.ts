// src/app/api/pick/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Rarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

function rollBox(): { rarity: Rarity; points: number } {
  const r = Math.random();

  if (r < 0.7) {
    const points = 10 + Math.floor(Math.random() * 31); // 10-40
    return { rarity: "COMMON", points };
  } else if (r < 0.9) {
    const points = 40 + Math.floor(Math.random() * 61); // 40-100
    return { rarity: "RARE", points };
  } else if (r < 0.99) {
    const points = 100 + Math.floor(Math.random() * 151); // 100-250
    return { rarity: "EPIC", points };
  } else {
    const points = 250 + Math.floor(Math.random() * 751); // 250-1000
    return { rarity: "LEGENDARY", points };
  }
}

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

    // stats lekérés
    const { data: stats, error: statsErr } = await supabase
      .from("user_stats")
      .select("*")
      .eq("fid", fid)
      .maybeSingle();

    if (statsErr) {
      console.error("user_stats select error:", statsErr);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    if (!stats) {
      return NextResponse.json(
        { error: "No stats row for this fid" },
        { status: 404 }
      );
    }

    let { free_picks_remaining, extra_picks_remaining } = stats as {
      free_picks_remaining: number | null;
      extra_picks_remaining: number | null;
      total_points: number | null;
      next_free_pick_at: string | null;
      common_opens: number | null;
      rare_opens: number | null;
      epic_opens: number | null;
      legendary_opens: number | null;
    };

    const now = new Date();

    // ha nincs free pick, de lejárt a next_free_pick_at, refill 1 free
    if (
      (free_picks_remaining ?? 0) <= 0 &&
      stats.next_free_pick_at &&
      new Date(stats.next_free_pick_at) <= now
    ) {
      free_picks_remaining = 1;
    }

    const hasFree = (free_picks_remaining ?? 0) > 0;
    const hasExtra = (extra_picks_remaining ?? 0) > 0;

    if (!hasFree && !hasExtra) {
      return NextResponse.json(
        { error: "No picks left" },
        { status: 400 }
      );
    }

    let usedFree = false;
    if (hasFree) {
      usedFree = true;
      free_picks_remaining = (free_picks_remaining ?? 0) - 1;
    } else {
      extra_picks_remaining = (extra_picks_remaining ?? 0) - 1;
    }

    const { rarity, points } = rollBox();

    const newTotalPoints = (stats.total_points ?? 0) + points;

    const common_opens =
      (stats.common_opens ?? 0) + (rarity === "COMMON" ? 1 : 0);
    const rare_opens =
      (stats.rare_opens ?? 0) + (rarity === "RARE" ? 1 : 0);
    const epic_opens =
      (stats.epic_opens ?? 0) + (rarity === "EPIC" ? 1 : 0);
    const legendary_opens =
      (stats.legendary_opens ?? 0) + (rarity === "LEGENDARY" ? 1 : 0);

    // ha most fogyott el az utolsó free pick → 24h múlva legyen új free
    let next_free_pick_at = stats.next_free_pick_at as string | null;
    if (usedFree && (free_picks_remaining ?? 0) <= 0) {
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      next_free_pick_at = in24h.toISOString();
    }

    const { data: updatedStats, error: updateErr } = await supabase
      .from("user_stats")
      .update({
        total_points: newTotalPoints,
        free_picks_remaining,
        extra_picks_remaining,
        next_free_pick_at,
        common_opens,
        rare_opens,
        epic_opens,
        legendary_opens,
        last_rarity: rarity,
        last_points: points,
        last_opened_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("fid", fid)
      .select()
      .single();

    if (updateErr || !updatedStats) {
      console.error("user_stats update error:", updateErr);
      return NextResponse.json(
        { error: "Failed to update stats" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      rarity,
      points,
      totalPoints: updatedStats.total_points,
      freePicksRemaining: updatedStats.free_picks_remaining,
      extraPicksRemaining: updatedStats.extra_picks_remaining,
      nextFreePickAt: updatedStats.next_free_pick_at,
      commonOpens: updatedStats.common_opens,
      rareOpens: updatedStats.rare_opens,
      epicOpens: updatedStats.epic_opens,
      legendaryOpens: updatedStats.legendary_opens,
    });
  } catch (err) {
    console.error("Error in /api/pick:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
