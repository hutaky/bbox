import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { ensureUser } from "@/lib/user";

function getFidFromRequest(req: Request): number | null {
  const header = req.headers.get("x-bbox-fid");
  if (header) {
    const fidFromHeader = Number(header);
    if (Number.isFinite(fidFromHeader)) return fidFromHeader;
  }

  try {
    const url = new URL(req.url);
    const fidParam = url.searchParams.get("fid");
    if (!fidParam) return null;
    const fid = Number(fidParam);
    return Number.isFinite(fid) ? fid : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const fid = getFidFromRequest(req);
  if (!fid) {
    return NextResponse.json(
      { error: "Missing FID (x-bbox-fid header or ?fid= param)" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const { txHash, packSize } = body;

  if (!txHash || !packSize) {
    return NextResponse.json(
      { error: "Missing txHash or packSize" },
      { status: 400 }
    );
  }

  await ensureUser(fid);

  const { data: stats } = await supabaseServer
    .from("user_stats")
    .select("*")
    .eq("fid", fid)
    .single();

  const newBalance = stats.extra_picks_balance + Number(packSize);

  const { data: updatedStats } = await supabaseServer
    .from("user_stats")
    .update({ extra_picks_balance: newBalance })
    .eq("fid", fid)
    .select("*")
    .single();

  await supabaseServer.from("payments").insert({
    fid,
    type: "extra",
    pack_size: packSize,
    eth_amount: null,
    tx_hash: txHash,
    status: "confirmed"
  });

  return NextResponse.json({
    success: true,
    extraPicksBalance: updatedStats.extra_picks_balance
  });
}
