// src/app/api/pay/extra/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAddress, parseUnits } from "viem";

export const runtime = "nodejs";

const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;

// árak (human) – envből
const PRICE_1 = String(process.env.BBOX_EXTRA_PRICE_1 || "0.5");
const PRICE_5 = String(process.env.BBOX_EXTRA_PRICE_5 || "2.0");
const PRICE_10 = String(process.env.BBOX_EXTRA_PRICE_10 || "3.5");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ennyi idő infot adunk vissza debugra (nem blokkolunk rá)
const PENDING_TTL_MINUTES = 10;

type Body = { fid: number; packSize: 1 | 5 | 10 };

function getPrice(packSize: 1 | 5 | 10) {
  if (packSize === 1) return PRICE_1;
  if (packSize === 5) return PRICE_5;
  return PRICE_10;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;
    const packSize = body?.packSize;

    if (!fid || !Number.isFinite(fid) || !packSize) {
      return NextResponse.json({ error: "Missing fid or packSize" }, { status: 400 });
    }

    if (!RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json({ error: "Server misconfigured (missing env)" }, { status: 500 });
    }

    if (!isAddress(RECEIVER_ADDRESS) || !isAddress(USDC_CONTRACT)) {
      return NextResponse.json(
        { error: "Invalid RECEIVER/USDC address", details: { RECEIVER_ADDRESS, USDC_CONTRACT } },
        { status: 500 }
      );
    }

    // 0) Azonnali “unstick”: zárjunk le minden nyitott pending extra_picks rekordot
    //    amihez még nincs frame_id (txHash). Így megszakadt vásárlás után is
    //    azonnal tud újra próbálkozni a user.
    //
    // NOTE: ha nálatok nincs 'cancelled' status, cseréld 'expired'-re vagy 'failed'-re.
    await supabase
      .from("payments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("fid", fid)
      .eq("kind", "extra_picks")
      .eq("status", "pending")
      .is("frame_id", null);

    const priceHuman = getPrice(packSize);

    // USDC decimals = 6 → base units string kell a sendToken-nak
    const amountUnits = parseUnits(priceHuman, 6).toString();

    // CAIP-19 asset id (Base + ERC20)
    const token = `eip155:8453/erc20:${USDC_CONTRACT}`;

    // 1) új pending payment record
    const { error: insertError } = await supabase.from("payments").insert({
      fid,
      kind: "extra_picks",
      pack_size: packSize,
      frame_id: null, // később ide kerül a txHash (settle-ben)
      status: "pending",
    });

    if (insertError) {
      console.error("payments insert error:", insertError);
      // nem blokkoljuk az appot — a settle úgyis txHash alapján dönt
    }

    return NextResponse.json({
      token,
      amount: amountUnits,
      recipientAddress: RECEIVER_ADDRESS,
      packSize,
      details: {
        priceHuman,
        decimals: 6,
        chainId: 8453,
        pendingTtlMinutes: PENDING_TTL_MINUTES,
        note: "If wallet flow is interrupted, you can retry immediately (old pending gets cancelled).",
      },
    });
  } catch (e: any) {
    console.error("Error in /api/pay/extra:", e);
    return NextResponse.json(
      { error: "Internal server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
