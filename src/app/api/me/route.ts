// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

// Egyetlen, service role-os Supabase kliens az API route-nak
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Minimal „ensureUser”: létrehozza a users + stats sort, ha nincs
async function ensureUserLocal(fid: number) {
  // users
  const { data: existingUser, error: userErr } = await supabase
    .from("users")
    .select("fid")
    .eq("fid", fid)
    .maybeSingle();

  if (userErr) {
    console.error("ensureUserLocal users fetch error:", userErr);
  }

  if (!existingUser) {
    const { error: insertUserErr } = await supabase.from("users").insert({
      fid,
      username: null,
      pfp_url: null,
      is_og: false,
    });

    if (insertUserErr) {
      console.error("ensureUserLocal users insert error:", insertUserErr);
    }
  }

  // stats
  const { data: existingStats, error: statsErr } = await supabase
    .from("stats")
    .select("fid")
    .eq("fid", fid)
    .maybeSingle();

  if (statsErr) {
    console.error("ensureUserLocal stats fetch error:", statsErr);
  }

  if (!existingStats) {
    const { error: insertStatsErr } = await supabase.from("stats").insert({
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
    });

    if (insertStatsErr) {
      console.error("ensureUserLocal stats insert error:", insertStatsErr);
    }
  }
}

// Megpróbáljuk Neynar-ból lehúzni a user nevet + pfp-t, és elmentjük
async function syncUserFromNeynar(fid: number) {
  if (!NEYNAR_API_KEY) return;

  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user?fid=${fid}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": NEYNAR_API_KEY,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Neynar user fetch error:", res.status, text);
      return;
    }

    const data: any = await res.json().catch(() => ({}));
    const user = data?.user || data?.result?.user || data;

    // Kísérleti, mert az endpoint struktúrája változhat
    const username: string | null =
      user?.username ??
      user?.custody_address ??
      null;

    const pfpUrl: string | null =
      user?.pfp_url ??
      user?.pfp?.url ??
      null;

    if (!username && !pfpUrl) return;

    const { error: updateErr } = await supabase
      .from("users")
      .update({
        username,
        pfp_url: pfpUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("fid", fid);

    if (updateErr) {
      console.error("syncUserFromNeynar update error:", updateErr);
    }
  } catch (e) {
    console.error("syncUserFromNeynar exception:", e);
  }
}

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

    // User + stats sor biztosítása
    await ensureUserLocal(fid);

    // Megpróbáljuk Neynar-ból frissíteni (nem blokkolja a választ, ha elromlik is)
    syncUserFromNeynar(fid).catch(() => {});

    // users tábla
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("fid, username, pfp_url, is_og")
      .eq("fid", fid)
      .maybeSingle();

    if (userErr) {
      console.error("Supabase users fetch error:", userErr);
    }

    // stats tábla
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
