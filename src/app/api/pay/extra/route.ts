// src/app/api/pay/extra/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!;
const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;

const PRICE_1 = String(process.env.BBOX_EXTRA_PRICE_1 || "0.5"); // 1 pick
const PRICE_5 = String(process.env.BBOX_EXTRA_PRICE_5 || "2.0"); // 5 pick
const PRICE_10 = String(process.env.BBOX_EXTRA_PRICE_10 || "3.5"); // 10 pick

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = {
  fid: number;
  packSize: 1 | 5 | 10;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;
    const packSize = body?.packSize;

    if (!fid || !Number.isFinite(fid) || !packSize) {
      return NextResponse.json({ error: "Missing fid or packSize" }, { status: 400 });
    }

    if (!NEYNAR_API_KEY || !RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json(
        {
          error: "Server misconfigured (Neynar env missing)",
          missing: {
            NEYNAR_API_KEY: !NEYNAR_API_KEY,
            NEYNAR_PAY_RECEIVER_ADDRESS: !RECEIVER_ADDRESS,
            NEYNAR_USDC_CONTRACT: !USDC_CONTRACT,
          },
        },
        { status: 500 }
      );
    }

    let amount: string;
    let lineItemName: string;

    switch (packSize) {
      case 1:
        amount = PRICE_1;
        lineItemName = "BBOX Extra Picks · 1";
        break;
      case 5:
        amount = PRICE_5;
        lineItemName = "BBOX Extra Picks · 5";
        break;
      case 10:
        amount = PRICE_10;
        lineItemName = "BBOX Extra Picks · 10";
        break;
      default:
        return NextResponse.json({ error: "Invalid packSize" }, { status: 400 });
    }

    const payload = {
      transaction: {
        to: {
          network: "base",
          address: RECEIVER_ADDRESS,
          token_contract_address: USDC_CONTRACT,
          amount, // string!
        },
      },
      config: {
        line_items: [
          {
            name: lineItemName,
            description: `Extra BBOX picks for FID ${fid}`,
            image: "https://box-sage.vercel.app/icon.png",
          },
        ],
        action: {
          text: "Pay with USDC",
          text_color: "#FFFFFF",
          button_color: "#0052FF",
        },
      },
      metadata: {
        kind: "extra_picks",
        fid,
        pack_size: packSize,
      },
    };

    const res = await fetch("https://api.neynar.com/v2/farcaster/frame/transaction/pay", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": NEYNAR_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await res.text().catch(() => "");
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = rawText;
    }

    if (!res.ok) {
      console.error("Neynar pay error:", res.status, data);
      return NextResponse.json(
        {
          error: "Failed to create Neynar pay frame",
          neynarStatus: res.status,
          neynarBody: data,
        },
        { status: 500 }
      );
    }

    const frameUrl = data?.transaction_frame?.url as string | undefined;
    const frameId = data?.transaction_frame?.id as string | undefined;

    if (!frameUrl || !frameId) {
      console.error("Invalid Neynar pay response:", data);
      return NextResponse.json(
        {
          error: "Invalid Neynar response (missing frameUrl/frameId)",
          neynarBody: data,
        },
        { status: 500 }
      );
    }

    // Payment record
    const { error: insertError } = await supabase.from("payments").insert({
      fid,
      kind: "extra_picks",
      pack_size: packSize,
      frame_id: frameId,
      status: "pending",
    });

    if (insertError) console.error("Failed to insert payment record:", insertError);

    return NextResponse.json({ frameUrl, frameId });
  } catch (error) {
    console.error("Error in /api/pay/extra:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
