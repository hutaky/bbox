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
  const { txHash } = body;

  if (!txHash) {
    return NextResponse.json({ error: "Missing txHash" }, { status: 400 });
  }

  await ensureUser(fid);

  await supabaseServer
    .from("users")
    .update({ is_og: true })
    .eq("fid", fid);

  await supabaseServer.from("payments").insert({
    fid,
    type: "og",
    pack_size: null,
    eth_amount: process.env.BBOX_OG_PRICE_ETH || null,
    tx_hash: txHash,
    status: "confirmed"
  });

  return NextResponse.json({ success: true });
}
