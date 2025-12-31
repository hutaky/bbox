import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type GlobalStats = {
  common: number;
  rare: number;
  epic: number;
  legendary: number;
  total: number;
};

export async function GET() {
  try {
    // Aggregálunk DB-ben (nem a kliensben), ez gyorsabb és olcsóbb
    const { data, error } = await supabaseAdmin
      .from("user_stats")
      .select("common_opens, rare_opens, epic_opens, legendary_opens");

    if (error) {
      return NextResponse.json(
        { error: "Failed to load global stats", details: error.message },
        { status: 500 }
      );
    }

    const common = (data ?? []).reduce((a, r: any) => a + Number(r.common_opens ?? 0), 0);
    const rare = (data ?? []).reduce((a, r: any) => a + Number(r.rare_opens ?? 0), 0);
    const epic = (data ?? []).reduce((a, r: any) => a + Number(r.epic_opens ?? 0), 0);
    const legendary = (data ?? []).reduce((a, r: any) => a + Number(r.legendary_opens ?? 0), 0);

    const out: GlobalStats = {
      common,
      rare,
      epic,
      legendary,
      total: common + rare + epic + legendary,
    };

    return NextResponse.json(out, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to load global stats", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
