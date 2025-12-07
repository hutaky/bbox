// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const fid = body?.fid as number | undefined;
    const incomingUsername = (body?.username ?? null) as string | null;
    const incomingPfpUrl = (body?.pfpUrl ?? null) as string | null;

    if (!fid || typeof fid !== "number" || !Number.isFinite(fid)) {
      return NextResponse.json(
        { error: "Missing or invalid fid" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // ---- USERS TÁBLA ----
    let userRow:
      | {
          username: string | null;
          pfp_url: string | null;
          is_og: boolean | null;
          is_pro: boolean | null;
        }
      | null = null;

    {
      const { data, error } = await supabase
        .from("users")
        .select("username, pfp_url, is_og, is_pro")
        .eq("fid", fid)
        .maybeSingle();

      if (error) {
        console.error("users select error in /api/me:", error);
        return NextResponse.json(
          { error: "Failed to load user" },
          { status: 500 }
        );
      }

      userRow = data;

      // Ha nincs sor -> insert az érkező profiladatokkal
      if (!userRow) {
        const { data: inserted, error: insertErr } = await supabase
          .from("users")
          .insert({
            fid,
            username: incomingUsername,
            pfp_url: incomingPfpUrl,
            is_og: false,
            is_pro: false,
          })
          .select("username, pfp_url, is_og, is_pro")
          .maybeSingle();

        if (insertErr) {
          console.error("users insert error in /api/me:", insertErr);
          return NextResponse.json(
            { error: "Failed to init user" },
            { status: 500 }
          );
        }

        userRow = inserted;
      } else {
        // Ha már van sor, de a Farcasterből új adat jön, frissítjük
        const shouldUpdate =
          (incomingUsername &&
            incomingUsername !== userRow.username) ||
          (incomingPfpUrl && incomingPfpUrl !== userRow.pfp_url);

        if (shouldUpdate) {
          const { data: updated, error: updateErr } = await supabase
            .from("users")
            .update({
              username: incomingUsername ?? userRow.username,
              pfp_url: incomingPfpUrl ?? userRow.pfp_url,
            })
            .eq("fid", fid)
            .select("username, pfp_url, is_og, is_pro")
            .maybeSingle();

          if (updateErr) {
            console.error("users update error in /api/me:", updateErr);
          } else if (updated) {
            userRow = updated;
          }
        }
      }
    }

    // ---- USER_STATS TÁBLA ----
    let stats:
      | {
          total_points: number | null;
          free_picks_remaining: number | null;
          extra_picks_balance: number | null;
          last_free_pick_at: string | null;
          common_opens: number | null;
          rare_opens: number | null;
          epic_opens: number | null;
          legendary_opens: number | null;
        }
      | null = null;

    {
      const { data, error } = await supabase
        .from("user_stats")
        .select(
          "total_points, free_picks_remaining, extra_picks_balance, last_free_pick_at, common_opens, rare_opens, epic_opens, legendary_opens"
        )
        .eq("fid", fid)
        .maybeSingle();

      if (error) {
        console.error("user_stats select error in /api/me:", error);
        return NextResponse.json(
          { error: "Failed to load stats" },
          { status: 500 }
        );
      }

      stats = data;

      if (!stats) {
        const { data: inserted, error: insertErr } = await supabase
          .from("user_stats")
          .insert({
            fid,
            total_points: 0,
            free_picks_remaining: 1,
            extra_picks_balance: 0,
            last_free_pick_at: null,
            common_opens: 0,
            rare_opens: 0,
            epic_opens: 0,
            legendary_opens: 0,
          })
          .select(
            "total_points, free_picks_remaining, extra_picks_balance, last_free_pick_at, common_opens, rare_opens, epic_opens, legendary_opens"
          )
          .maybeSingle();

        if (insertErr) {
          console.error("user_stats insert error in /api/me:", insertErr);
          return NextResponse.json(
            { error: "Failed to init stats" },
            { status: 500 }
          );
        }

        stats = inserted;
      }
    }

    // ---- nextFreePickAt számítása ----
    let nextFreePickAt: string | null = null;

    const freeLeft = stats?.free_picks_remaining ?? 0;
    const lastFree = stats?.last_free_pick_at
      ? new Date(stats.last_free_pick_at).getTime()
      : null;

    if (freeLeft > 0) {
      nextFreePickAt = null;
    } else if (lastFree) {
      const target = lastFree + ONE_DAY_MS;
      nextFreePickAt = new Date(target).toISOString();
    } else {
      nextFreePickAt = null;
    }

    // ---- Válasz (ApiUserState formátum) ----
    return NextResponse.json({
      fid,
      username: userRow?.username ?? null,
      pfpUrl: userRow?.pfp_url ?? null,
      isOg: userRow?.is_og ?? false,
      isPro: userRow?.is_pro ?? false,

      totalPoints: stats?.total_points ?? 0,
      freePicksRemaining: stats?.free_picks_remaining ?? 0,
      extraPicksRemaining: stats?.extra_picks_balance ?? 0,

      nextFreePickAt,
      commonOpens: stats?.common_opens ?? 0,
      rareOpens: stats?.rare_opens ?? 0,
      epicOpens: stats?.epic_opens ?? 0,
      legendaryOpens: stats?.legendary_opens ?? 0,

      lastResult: null,
    });
  } catch (e) {
    console.error("/api/me fatal error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
