// src/app/api/global-stats/route.ts
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

export async function GET() {
  try {
    // minden játékos stat sorát lehúzzuk, és összeadjuk
    // (ez a "legegyszerűbb", később lehet SQL view/RPC, ha nagyon nagy lesz)
    const { data, error } = await supabase
      .from("user_stats")
      .select("common_opens, rare_opens, epic_opens, legendary_opens")
      .limit(100000); // ha ennél több user lesz, szólj és optimalizáljuk

    if (error) {
      console.error("global-stats error:", error);
      return NextResponse.json({ error: "Failed to load global stats" }, { status: 500 });
    }

    let common = 0,
      rare = 0,
      epic = 0,
      legendary = 0;

    for (const row of data || []) {
      common += Number(row.common_opens ?? 0);
      rare += Number(row.rare_opens ?? 0);
      epic += Number(row.epic_opens ?? 0);
      legendary += Number(row.legendary_opens ?? 0);
    }

    const total = common + rare + epic + legendary;

    return NextResponse.json(
      { common, rare, epic, legendary, total },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (e) {
    console.error("global-stats fatal:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
