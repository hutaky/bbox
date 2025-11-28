import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { ensureUser } from "@/lib/user";

function getFidFromRequest(req: Request): number | null {
  const header = req.headers.get("x-bbox-fid");
  if (!header) return null;
  const fid = Number(header);
  return Number.isFinite(fid) ? fid : null;
}

export async function POST(req: Request) {
  const fid = getFidFromRequest(req);
  if (!fid) {
    return NextResponse.json({ error: "Missing FID (x-bbox-fid header)" }, { status: 401 });
  }

  const body = await req.json();
  const { txHash, packSize } = body;

  if (!txHash || !packSize) {
    return NextResponse.json({ error: "Missing txHash or packSize" }, { status: 400 });
  }

  await ensureUser(fid);

  // TODO: verify on-chain payment to treasury with correct amount based on packSize.

  const { data: stats, error: statsErr } = await supabaseServer
    .from("user_stats")
    .select("*")
    .eq("fid", fid)
    .single();

  if (statsErr || !stats) {
    console.error("extra buy stats error", statsErr);
    return NextResponse.json({ error: "Stats not found" }, { status: 500 });
  }

  const newBalance = stats.extra_picks_balance + Number(packSize);

  const { data: updatedStats, error: updateErr } = await supabaseServer
    .from("user_stats")
    .update({ extra_picks_balance: newBalance })
    .eq("fid", fid)
    .select("*")
    .single();

  if (updateErr) {
    console.error("extra buy update error", updateErr);
    return NextResponse.json({ error: "Failed to update picks balance" }, { status: 500 });
  }

  const { error: payErr } = await supabaseServer.from("payments").insert({
    fid,
    type: "extra",
    pack_size: packSize,
    eth_amount: null,
    tx_hash: txHash,
    status: "confirmed"
  });

  if (payErr) {
    console.error("extra buy payment insert error", payErr);
  }

  return NextResponse.json({
    success: true,
    extraPicksBalance: updatedStats.extra_picks_balance
  });
}
