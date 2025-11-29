import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  // RPC: get_leaderboard_with_rarity (ezt mindjárt mutatom SQL-ben is)
  const { data, error } = await supabaseServer.rpc(
    "get_leaderboard_with_rarity"
  );

  if (error) {
    console.error("leaderboard error", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard" },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
