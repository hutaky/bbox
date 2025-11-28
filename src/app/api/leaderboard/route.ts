import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("user_stats")
    .select("fid, total_points, users(username, is_og)")
    .order("total_points", { ascending: false })
    .limit(100);

  if (error) {
    console.error("leaderboard error", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard" },
      { status: 500 }
    );
  }

  const rows = (data || []).map((row: any, index: number) => ({
    rank: index + 1,
    fid: row.fid,
    totalPoints: row.total_points,
    username: row.users?.username ?? `fid:${row.fid}`,
    isOg: row.users?.is_og ?? false
  }));

  return NextResponse.json({ leaderboard: rows });
}
