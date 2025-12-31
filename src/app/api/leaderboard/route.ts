// src/app/api/leaderboard/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
/**
 * Ne generáljon statikus cache-t / revalidate-et
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function GET() {
  try {
    // 1) Statok pontszám szerint rendezve
    const { data: stats, error: statsErr } = await supabase
      .from("user_stats")
      .select(
        `
        fid,
        total_points,
        common_opens,
        rare_opens,
        epic_opens,
        legendary_opens
      `
      )
      .order("total_points", { ascending: false })
      .limit(100);

    if (statsErr) {
      console.error("leaderboard stats error:", statsErr);
      return NextResponse.json(
        { error: "Failed to load leaderboard stats" },
        {
          status: 500,
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        }
      );
    }

    if (!stats || stats.length === 0) {
      return NextResponse.json([], {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      });
    }

    // 2) Username-ek + OG flag lehúzása
    const fids = stats.map((s: any) => s.fid).filter(Boolean);

    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("fid, username, is_og")
      .in("fid", fids);

    if (usersErr) {
      console.error("leaderboard users error:", usersErr);
      // ha ez elszáll, usernév nélkül is menjen
    }

    const userMap = new Map<number, { username: string | null; is_og: boolean }>();
    (users || []).forEach((u: any) => {
      userMap.set(u.fid, {
        username: u.username ?? null,
        is_og: Boolean(u.is_og),
      });
    });

    // 3) Frontend által várt struktúra (+ is_og)
    const rows = stats.map((s: any) => {
      const u = userMap.get(s.fid);
      return {
        fid: s.fid,
        username: u?.username ?? null,
        is_og: u?.is_og ?? false,
        total_points: s.total_points ?? 0,
        common_count: s.common_opens ?? 0,
        rare_count: s.rare_opens ?? 0,
        epic_count: s.epic_opens ?? 0,
        legendary_count: s.legendary_opens ?? 0,
      };
    });

    return NextResponse.json(rows, {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (err) {
    console.error("leaderboard route fatal error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  }
}
