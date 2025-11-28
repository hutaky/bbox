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
  const { txHash } = body;

  if (!txHash) {
    return NextResponse.json({ error: "Missing txHash" }, { status: 400 });
  }

  await ensureUser(fid);

  // TODO: verify on-chain payment to BBOX_TREASURY_ADDRESS with BBOX_OG_PRICE_ETH amount.

  const { error: userErr } = await supabaseServer
    .from("users")
    .update({ is_og: true })
    .eq("fid", fid);

  if (userErr) {
    console.error("OG update error", userErr);
    return NextResponse.json({ error: "Failed to set OG" }, { status: 500 });
  }

  const { error: payErr } = await supabaseServer.from("payments").insert({
    fid,
    type: "og",
    pack_size: null,
    eth_amount: process.env.BBOX_OG_PRICE_ETH || null,
    tx_hash: txHash,
    status: "confirmed"
  });

  if (payErr) {
    console.error("OG payment insert error", payErr);
  }

  return NextResponse.json({ success: true });
}
