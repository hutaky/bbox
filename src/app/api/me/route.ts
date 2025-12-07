// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { ensureUser, getDailyFreePicks } from "@/lib/user";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const fid = body?.fid;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "Invalid or missing fid" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Gondoskodunk róla, hogy user + stats sor létezzen
    await ensureUser(fid);

    // USER adatok
    const { data: userRows, error: userError } = await supabase
      .from("users")
      .select("fid, username, pfp_url, is_og, is_pro")
      .eq("fid", fid)
      .limit(1);

    if (userError || !userRows || userRows.length === 0) {
      console.error("me: users select error", userError);
      return NextResponse.json(
        { error: "User not found" },
        { status: 500 }
      );
    }

    const user = userRows[0];

    // STATS
    const { data: statsRows, error: statsError } = await supabase
      .from("user_stats")
      .select(
        "free_picks_remaining, extra_picks_balance, total_points, next_free_pick_at, common_opens, rare_opens, epic_opens, legendary_opens"
      )
      .eq("fid", fid)
      .limit(1);

    if (statsError || !statsRows || statsRows.length === 0) {
      console.error("me: user_stats select error", statsError);
      return NextResponse.json(
        { error: "Stats not found" },
        { status: 500 }
      );
    }

    const stats = statsRows[0];

    const now = new Date();
    let freePicksRemaining = stats.free_picks_remaining ?? 0;
    let nextFreePickAt: string | null = stats.next_free_pick_at;

    // Napi refill logika: ha nincs beállítva, vagy lejárt, újratöltjük
    if (!nextFreePickAt || new Date(nextFreePickAt) <= now) {
      const dailyFree = getDailyFreePicks(
        !!user.is_og,
        !!user.is_pro
      );

      freePicksRemaining = dailyFree;

      const nextDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      nextFreePickAt = nextDate.toISOString();

      const { error: updateError } = await supabase
        .from("user_stats")
        .update({
          free_picks_remaining: freePicksRemaining,
          next_free_pick_at: nextFreePickAt,
        })
        .eq("fid", fid);

      if (updateError) {
        console.error("me: user_stats update error (refill)", updateError);
      }
    }

    return NextResponse.json({
      fid: user.fid,
      username: user.username,
      pfpUrl: user.pfp_url,
      isOg: !!user.is_og,
      isPro: !!user.is_pro,
      totalPoints: stats.total_points ?? 0,
      freePicksRemaining,
      extraPicksRemaining: stats.extra_picks_balance ?? 0,
      nextFreePickAt,
      commonOpens: stats.common_opens ?? 0,
      rareOpens: stats.rare_opens ?? 0,
      epicOpens: stats.epic_opens ?? 0,
      legendaryOpens: stats.legendary_opens ?? 0,
    });
  } catch (err) {
    console.error("me: unexpected error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
