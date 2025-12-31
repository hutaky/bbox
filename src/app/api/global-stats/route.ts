import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// ✅ KÉNYSZERÍTETT DINAMIKUS ROUTE (ne cache-elje a Next)
export const dynamic = "force-dynamic";
export const revalidate = 0;

type GlobalStats = {
  common: number;
  rare: number;
  epic: number;
  legendary: number;
  total: number;
};

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("user_stats")
      .select("common_opens, rare_opens, epic_opens, legendary_opens");

    if (error) {
      return NextResponse.json(
        { error: "Failed to load global stats", details: error.message },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Vercel-CDN-Cache-Control": "no-store",
          },
        }
      );
    }

    const rows = data ?? [];

    const common = rows.reduce((a, r: any) => a + Number(r.common_opens ?? 0), 0);
    const rare = rows.reduce((a, r: any) => a + Number(r.rare_opens ?? 0), 0);
    const epic = rows.reduce((a, r: any) => a + Number(r.epic_opens ?? 0), 0);
    const legendary = rows.reduce((a, r: any) => a + Number(r.legendary_opens ?? 0), 0);

    const out: GlobalStats = {
      common,
      rare,
      epic,
      legendary,
      total: common + rare + epic + legendary,
    };

    return NextResponse.json(out, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to load global stats", details: String(e?.message ?? e) },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
        },
      }
    );
  }
}
