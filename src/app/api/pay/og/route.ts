// src/app/api/pay/og/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAddress, parseUnits } from "viem";

export const runtime = "nodejs";

const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;
const OG_PRICE = String(process.env.BBOX_OG_PRICE || "5.0");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// csak debugra adjuk vissza
const PENDING_TTL_MINUTES = 10;

type Body = { fid: number };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;

    if (!fid || !Number.isFinite(fid)) {
      return NextResponse.json({ error: "Missing fid" }, { status: 400 });
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

    // 0) Ha már OG, backend is védjen (UI mellett)
    const { data: userRow, error: uErr } = await supabase
      .from("users")
      .select("fid, is_og")
      .eq("fid", fid)
      .maybeSingle();

    if (uErr) console.error("users select og check error:", uErr);
    if (userRow?.is_og) {
      return NextResponse.json({ error: "Already OG" }, { status: 409 });
    }

    // 1) Azonnali “unstick”: zárjunk le minden nyitott pending OG rekordot
    //    amihez még nincs frame_id (txHash). Így megszakadt vásárlás után is
    //    azonnal tud újra próbálkozni.
    //
    // NOTE: ha nálatok nincs 'cancelled' status, cseréld 'expired'-re.
    await supabase
      .from("payments")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("fid", fid)
      .eq("kind", "og_rank")
      .eq("status", "pending")
      .is("frame_id", null);

    // 2) Payment payload
    const amountUnits = parseUnits(OG_PRICE, 6).toString();
    const token = `eip155:8453/erc20:${USDC_CONTRACT}`;

    // 3) új pending sor
    const { error: insertError } = await supabase.from("payments").insert({
      fid,
      kind: "og_rank",
      pack_size: null,
      frame_id: null, // settle majd txHash-t ide írja
      status: "pending",
    });

    if (insertError) {
      console.error("payments insert OG error:", insertError);
      // nem blokkoljuk — settle txHash alapján úgyis érvényesít
    }

    return NextResponse.json({
      token,
      amount: amountUnits,
      recipientAddress: RECEIVER_ADDRESS,
      details: {
        priceHuman: OG_PRICE,
        decimals: 6,
        chainId: 8453,
        pendingTtlMinutes: PENDING_TTL_MINUTES,
        note: "If wallet flow is interrupted, you can retry immediately (old pending gets cancelled).",
      },
    });
  } catch (e: any) {
    console.error("Error in /api/pay/og:", e);
    return NextResponse.json(
      { error: "Internal server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
