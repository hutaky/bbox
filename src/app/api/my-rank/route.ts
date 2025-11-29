// src/app/api/my-rank/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

    // --- saját stat sor ---
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
      .eq("fid", fid)
      .maybeSingle();

    if (statsErr) {
      console.error("my-rank stats error:", statsErr);
      return NextResponse.json(
        { error: "Failed to load stats" },
        { status: 500 }
      );
    }

    if (!stats) {
      // még nem játszott – nincs sor
      return NextResponse.json(
        {
          fid,
          username: null,
          rank: null,
          total_points: 0,
          common_count: 0,
          rare_count: 0,
          epic_count: 0,
          legendary_count: 0,
        },
        {
          headers: {
            "Cache-Control":
              "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        }
      );
    }

    // --- username ---
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("username")
      .eq("fid", fid)
      .maybeSingle();

    if (userErr) {
      console.error("my-rank user error:", userErr);
    }

    // --- rank kiszámítása: hányan vannak nálad több ponttal? ---
    const { count, error: countErr } = await supabase
      .from("user_stats")
      .select("*", { count: "exact", head: true })
      .gt("total_points", stats.total_points ?? 0);

    if (countErr) {
      console.error("my-rank count error:", countErr);
    }

    const rank = (count ?? 0) + 1;

    return NextResponse.json(
      {
        fid,
        username: user?.username ?? null,
        rank,
        total_points: stats.total_points ?? 0,
        common_count: stats.common_opens ?? 0,
        rare_count: stats.rare_opens ?? 0,
        epic_count: stats.epic_opens ?? 0,
        legendary_count: stats.legendary_opens ?? 0,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (err) {
    console.error("my-rank route fatal error:", err);
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
