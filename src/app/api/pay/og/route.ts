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

type Body = { fid: number };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;

    if (!fid || !Number.isFinite(fid)) {
      return NextResponse.json({ error: "Missing fid" }, { status: 400 });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          error: "Server misconfigured (missing Supabase env)",
          details: {
            hasUrl: Boolean(SUPABASE_URL),
            hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
          },
        },
        { status: 500 }
      );
    }

    if (!RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json({ error: "Server misconfigured (missing pay env)" }, { status: 500 });
    }

    if (!isAddress(RECEIVER_ADDRESS) || !isAddress(USDC_CONTRACT)) {
      return NextResponse.json(
        { error: "Invalid RECEIVER/USDC address", details: { RECEIVER_ADDRESS, USDC_CONTRACT } },
        { status: 500 }
      );
    }

    // 1) Already OG? -> block
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("fid, is_og")
      .eq("fid", fid)
      .maybeSingle();

    if (userErr) {
      console.error("users select error:", userErr);
      return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
    }

    if (userRow?.is_og) {
      return NextResponse.json(
        { error: "Already OG", code: "ALREADY_OG" },
        { status: 409 }
      );
    }

    // 2) Pending OG payment exists? -> block (prevents spam / double click)
    const { data: pendingOg, error: pendingErr } = await supabase
      .from("payments")
      .select("id, status")
      .eq("fid", fid)
      .eq("kind", "og_rank")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (pendingErr) {
      console.error("payments pending check error:", pendingErr);
      return NextResponse.json({ error: "Failed to validate pending payment" }, { status: 500 });
    }

    if (pendingOg && pendingOg.length > 0) {
      return NextResponse.json(
        { error: "OG payment already pending", code: "PAYMENT_PENDING" },
        { status: 409 }
      );
    }

    // Prepare payload for sendToken
    const amount = parseUnits(OG_PRICE, 6).toString();
    const token = `eip155:8453/erc20:${USDC_CONTRACT}`;

    // Create pending payment intent
    const { data: insert, error: insertError } = await supabase
      .from("payments")
      .insert({
        fid,
        kind: "og_rank",
        pack_size: null,
        frame_id: null,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !insert?.id) {
      console.error("payments insert OG error:", insertError);
      return NextResponse.json(
        {
          error: "Failed to create OG payment intent",
          details: {
            message: insertError?.message ?? null,
            code: (insertError as any)?.code ?? null,
            hint: (insertError as any)?.hint ?? null,
            details: (insertError as any)?.details ?? null,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      paymentId: insert.id,
      token,
      amount,
      recipientAddress: RECEIVER_ADDRESS,
    });
  } catch (e: any) {
    console.error("Error in /api/pay/og:", e);
    return NextResponse.json(
      { error: "Internal server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
