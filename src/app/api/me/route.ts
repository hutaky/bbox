// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ApiUserState } from "@/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Supabase env vars missing in /api/me");
      return NextResponse.json(
        { error: "Server misconfigured (Supabase)" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- USERS: username + pfp upsert (de pontokhoz nem nyúlunk) ---
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
      // ha nincs érkező adat, legalább legyen egy sor
      const { error: insertUserError } = await supabase
        .from("users")
        .insert({ fid })
        .select()
        .maybeSingle();

      // 23505 = unique violation → már létezik, ezt lenyeljük
      if (insertUserError && insertUserError.code !== "23505") {
        console.error("users insert error:", insertUserError);
      }
    }

    // --- USERS sor kiolvasása ---
    const { data: userRow, error: userSelectError } = await supabase
      .from("users")
      .select("*")
      .eq("fid", fid)
      .maybeSingle();

    if (userSelectError) {
      console.error("users select error:", userSelectError);
    }

    // --- USER_STATS: ha nincs, létrehozzuk ---
    const { data: statsRow, error: statsSelectError } = await supabase
      .from("user_stats")
      .select("*")
      .eq("fid", fid)
      .maybeSingle();

    if (statsSelectError && statsSelectError.code !== "PGRST116") {
      // PGRST116 = no rows
      console.error("user_stats select error:", statsSelectError);
    }

    let finalStats = statsRow;

    if (!statsRow) {
      const { data: insertedStats, error: insertStatsError } = await supabase
        .from("user_stats")
        .insert({
          fid,
          total_points: 0,
          free_picks_remaining: 1, // alap napi 1 nyitás
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

    const stats = finalStats ?? statsRow ?? null;

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
      extraPicksRemaining: stats?.extra_picks_remaining ?? 0,
      nextFreePickAt: stats?.next_free_pick_at ?? null,
      commonOpens: stats?.common_opens ?? 0,
      rareOpens: stats?.rare_opens ?? 0,
      epicOpens: stats?.epic_opens ?? 0,
      legendaryOpens: stats?.legendary_opens ?? 0,
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
