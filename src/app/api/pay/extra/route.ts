// src/app/api/pay/extra/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAddress, parseUnits } from "viem";

export const runtime = "nodejs";

const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;

const PRICE_1 = String(process.env.BBOX_EXTRA_PRICE_1 || "0.5");
const PRICE_5 = String(process.env.BBOX_EXTRA_PRICE_5 || "2.0");
const PRICE_10 = String(process.env.BBOX_EXTRA_PRICE_10 || "3.5");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

    const priceHuman = getPrice(packSize);
    const amount = parseUnits(priceHuman, 6).toString();
    const token = `eip155:8453/erc20:${USDC_CONTRACT}`;

    // ⚠️ Fontos: kérjük vissza az id-t, és ha insert fail, álljunk meg
    const { data, error: insertError } = await supabase
      .from("payments")
      .insert({
        fid,
        kind: "extra_picks",
        pack_size: packSize,
        frame_id: null,
        status: "pending",
        // ajánlott plusz mezők, ha felveszed őket a táblába:
        // expected_amount: amount,
        // recipient_address: RECEIVER_ADDRESS,
        // token,
      })
      .select("id")
      .single();

    if (insertError || !data?.id) {
      console.error("payments insert error:", insertError);
      return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
    }

    // Response: sendToken-hoz szükséges mezők + paymentId a settle-hez
    return NextResponse.json({
      paymentId: data.id,
      token,
      amount,
      recipientAddress: RECEIVER_ADDRESS,
      packSize,
    });
  } catch (e: any) {
    console.error("Error in /api/pay/extra:", e);
    return NextResponse.json(
      { error: "Internal server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
