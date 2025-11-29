// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type NeynarUser = {
  fid: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
  pfps?: { url: string }[];
};

type NeynarBulkResponse = {
  users?: NeynarUser[];
};

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

    // --- 1) Neynar profil lekérés (username + pfp) ---
    let username: string | null = null;
    let pfpUrl: string | null = null;

    const neynarApiKey = process.env.NEYNAR_API_KEY;
    if (neynarApiKey) {
      try {
        const res = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
          {
            headers: {
              accept: "application/json",
              api_key: neynarApiKey,
            },
          }
        );

        if (res.ok) {
          const data = (await res.json()) as NeynarBulkResponse;
          const u = data.users?.[0];
          if (u) {
            username = u.username ?? u.display_name ?? null;
            pfpUrl =
              u.pfp_url ??
              (Array.isArray(u.pfps) && u.pfps.length > 0
                ? u.pfps[0].url
                : null);
          }
        } else {
          console.error("Neynar user fetch failed", await res.text());
        }
      } catch (err) {
        console.error("Error calling Neynar bulk user API:", err);
      }
    }

    // --- 2) Supabase kliens (közvetlenül @supabase/supabase-js-ből) ---
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Ha nincs Supabase config, akkor csak Neynar-adatot adunk vissza,
    // hogy legalább a pfp+username működjön, ne legyél "Guest".
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        fid,
        username: username ?? `fid_${fid}`,
        pfpUrl,
        isOg: false,
        totalPoints: 0,
        freePicksRemaining: 0,
        extraPicksRemaining: 0,
        nextFreePickAt: null,
        commonPicks: 0,
        rarePicks: 0,
        epicPicks: 0,
        legendaryPicks: 0,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const safeUsername = username ?? `fid_${fid}`;

    // --- 3) users upsert (fid + profil adatok) ---
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .upsert(
        {
          fid,
          username: safeUsername,
          pfp_url: pfpUrl,
        },
        { onConflict: "fid" }
      )
      .select()
      .single();

    if (userError) {
      console.error("Supabase users upsert error:", userError);
    }

    // --- 4) user_stats lekérés / létrehozás ---
    let stats: any = null;

    const { data: existingStats, error: statsSelectError } = await supabase
      .from("user_stats")
      .select("*")
      .eq("fid", fid)
      .maybeSingle();

    if (statsSelectError) {
      console.error("Supabase user_stats select error:", statsSelectError);
    }

    if (!existingStats) {
      const { data: inserted, error: insertError } = await supabase
        .from("user_stats")
        .insert({
          fid,
          total_points: 0,
          free_picks_remaining: 1,
          extra_picks_remaining: 0,
          last_pick_at: null,
          next_free_pick_at: null,
          common_picks: 0,
          rare_picks: 0,
          epic_picks: 0,
          legendary_picks: 0,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Supabase user_stats insert error:", insertError);
      } else {
        stats = inserted;
      }
    } else {
      stats = existingStats;
    }

    // --- 5) Válasz, amit a frontend már ismer ---
    return NextResponse.json({
      fid,
      username: userRow?.username ?? safeUsername,
      pfpUrl: userRow?.pfp_url ?? pfpUrl,
      isOg: userRow?.is_og ?? false,
      totalPoints: stats?.total_points ?? 0,
      freePicksRemaining: stats?.free_picks_remaining ?? 0,
      extraPicksRemaining: stats?.extra_picks_remaining ?? 0,
      nextFreePickAt: stats?.next_free_pick_at,
      commonPicks: stats?.common_picks ?? 0,
      rarePicks: stats?.rare_picks ?? 0,
      epicPicks: stats?.epic_picks ?? 0,
      legendaryPicks: stats?.legendary_picks ?? 0,
    });
  } catch (err) {
    console.error("Error in /api/me:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
