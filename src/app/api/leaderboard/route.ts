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
    // 1) statok lekérése pontszám szerint rendezve
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
        { status: 500 }
      );
    }

    if (!stats || stats.length === 0) {
      return NextResponse.json([]);
    }

    // 2) a leaderboardon megjelenő FID-ekhez lehúzzuk a userneveket
    const fids = stats.map((s) => s.fid);

    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("fid, username")
      .in("fid", fids);

    if (usersErr) {
      console.error("leaderboard users error:", usersErr);
      // ha ez elhasal, akkor is visszaadjuk a létra sort usernév nélkül
    }

    const usernameMap = new Map<number, string | null>();
    (users || []).forEach((u: any) => {
      usernameMap.set(u.fid, u.username ?? null);
    });

    // 3) összeállítjuk a front-end által várt struktúrát
    const rows = stats.map((s: any) => ({
      fid: s.fid,
      username: usernameMap.get(s.fid) ?? null,
      total_points: s.total_points ?? 0,
      common_count: s.common_opens ?? 0,
      rare_count: s.rare_opens ?? 0,
      epic_count: s.epic_opens ?? 0,
      legendary_count: s.legendary_opens ?? 0,
    }));

    return NextResponse.json(rows);
  } catch (err) {
    console.error("leaderboard route fatal error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
