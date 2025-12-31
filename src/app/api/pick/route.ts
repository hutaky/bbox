import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const fid = Number(body?.fid);
    const boxIndex = Number(body?.boxIndex ?? 0);

    if (!Number.isFinite(fid) || fid <= 0) {
      return NextResponse.json({ error: "Missing/invalid fid" }, { status: 400 });
    }
    if (!Number.isFinite(boxIndex) || boxIndex < 0 || boxIndex > 2) {
      return NextResponse.json({ error: "Invalid boxIndex" }, { status: 400 });
    }

    // Atomikus DB művelet
    const { data, error } = await supabaseAdmin.rpc("open_bbox", {
      p_fid: fid,
      p_box_index: boxIndex,
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to open box", details: error.message },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (data?.error === "no_picks_left") {
      return NextResponse.json(
        { error: "No picks left" },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to open box", details: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
