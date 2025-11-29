import { NextResponse } from "next/server";
import createServerClient from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc("get_leaderboard_with_rarity");

  if (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }

  return NextResponse.json(data);
}
