// src/app/api/leaderboard/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("user_stats")
      .select(
        `
        fid,
        total_points,
        common_opens,
        rare_opens,
        epic_opens,
        legendary_opens,
        users!inner (
          username
        )
      `
      )
      .order("total_points", { ascending: false })
      .limit(100);

    if (error) {
      console.error("leaderboard select error:", error);
      return NextResponse.json(
        { error: "DB error" },
        { status: 500 }
      );
    }

    const rows = (data || []).map((row: any) => ({
      fid: row.fid as number,
      username: row.users?.username ?? null,
      total_points: row.total_points ?? 0,
      common_count: row.common_opens ?? 0,
      rare_count: row.rare_opens ?? 0,
      epic_count: row.epic_opens ?? 0,
      legendary_count: row.legendary_opens ?? 0,
    }));

    return NextResponse.json(rows, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Unexpected error in /api/leaderboard:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
