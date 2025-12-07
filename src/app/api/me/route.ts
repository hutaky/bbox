// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import type { ApiUserState } from "@/types";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as
      | { fid?: number; username?: string | null; pfpUrl?: string | null }
      | null;

    const fid = body?.fid;

    if (!fid || !Number.isFinite(fid)) {
      return NextResponse.json(
        { error: "Missing or invalid fid" },
        { status: 400 }
      );
    }

    const incomingUsername = body?.username ?? null;
    const incomingPfpUrl = body?.pfpUrl ?? null;

    const supabase = supabaseServer();

    // ---- USERS: upsert username + pfp (de NEM írunk bele pontokat stb.) ----
    if (incomingUsername || incomingPfpUrl) {
      const { error: upsertUserError } = await supabase
        .from("users")
        .upsert(
          {
            fid,
            username: incomingUsername,
            pfp_url: incomingPfpUrl,
          },
          { onConflict: "fid" }
        );

      if (upsertUserError) {
        console.error("users upsert error:", upsertUserError);
      }
    } else {
      // ha nincs érkező adat, legalább legyen sor
      const { error: insertUserError } = await supabase
        .from("users")
        .insert({ fid })
        .select()
        .maybeSingle();

      if (insertUserError && insertUserError.code !== "23505") {
        // 23505 = unique violation => már létezik, nem baj
        console.error("users insert error:", insertUserError);
      }
    }

    // ---- USERS sor kiolvasása ----
    const { data: userRow, error: userSelectError } = await supabase
      .from("users")
      .select("*")
      .eq("fid", fid)
      .maybeSingle();

    if (userSelectError) {
      console.error("users select error:", userSelectError);
    }

    // ---- USER_STATS: ha nincs sor, létrehozzuk, de NEM írjuk felül a meglévőt ----
    const { data: statsRow, error: statsSelectError } = await supabase
      .from("user_stats")
      .select("*")
      .eq("fid", fid)
      .maybeSingle();

    if (statsSelectError && statsSelectError.code !== "PGRST116") {
      // PGRST116 = no rows found
      console.error("user_stats select error:", statsSelectError);
    }

    let finalStats = statsRow;

    if (!statsRow) {
      // Új user: kezdő értékek – IMPORTANT: itt 0-ról indul, de a meglévő pontjaidat
      // NEM írjuk felül, mert ha már volt sor, ide be se jövünk.
      const { data: insertedStats, error: insertStatsError } = await supabase
        .from("user_stats")
        .insert({
          fid,
          total_points: 0,
          free_picks_remaining: 1,      // alap napi 1 nyitás
          extra_picks_balance: 0,
          common_opens: 0,
          rare_opens: 0,
          epic_opens: 0,
          legendary_opens: 0,
          next_free_pick_at: null,
        })
        .select()
        .maybeSingle();

      if (insertStatsError) {
        console.error("user_stats insert error:", insertStatsError);
      } else {
        finalStats = insertedStats ?? null;
      }
    }

    // ha itt sincs, akkor valami nagyon félrement, de ne dobjuk el az egész kérést
    const stats = finalStats ?? statsRow ?? null;

    // ---- ApiUserState összeállítása ----
    const username =
      userRow?.username ??
      incomingUsername ??
      null;

    const pfpUrl =
      userRow?.pfp_url ??
      incomingPfpUrl ??
      null;

    const isOg = Boolean(userRow?.is_og);
    const isPro = Boolean(userRow?.is_pro);

    const response: ApiUserState = {
      fid,
      username,
      pfpUrl,
      isOg,
      isPro,
      totalPoints: stats?.total_points ?? 0,
      freePicksRemaining: stats?.free_picks_remaining ?? 0,
      extraPicksRemaining: stats?.extra_picks_balance ?? 0,
      nextFreePickAt: stats?.next_free_pick_at ?? null,
      commonOpens: stats?.common_opens ?? 0,
      rareOpens: stats?.rare_opens ?? 0,
      epicOpens: stats?.epic_opens ?? 0,
      legendaryOpens: stats?.legendary_opens ?? 0,
      lastResult: null, // ezt a /api/pick tölti be, ha szeretnénk
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Unhandled /api/me error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
