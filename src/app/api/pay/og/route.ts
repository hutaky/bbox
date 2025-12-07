// src/app/api/pay/og/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!;
const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;
const OG_PRICE = Number(process.env.BBOX_OG_PRICE || "5.0");

// Ugyanaz a Supabase konfig, mint máshol
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = {
  fid: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;

    if (!fid) {
      return NextResponse.json(
        { error: "Missing fid" },
        { status: 400 }
      );
    }

    if (!NEYNAR_API_KEY || !RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json(
        { error: "Server misconfigured (Neynar / payment envs missing)" },
        { status: 500 }
      );
    }

    const payload = {
      transaction: {
        to: {
          network: "base",
          address: RECEIVER_ADDRESS,
          token_contract_address: USDC_CONTRACT,
          amount: OG_PRICE,
        },
      },
      config: {
        line_items: [
          {
            name: "BBOX OG Rank",
            description: `Permanent OG rank for FID ${fid}`,
            image: "https://box-sage.vercel.app/icon.png",
          },
        ],
        action: {
          text: "Buy OG Rank",
          text_color: "#FFFFFF",
          button_color: "#7C3AED",
        },
      },
      metadata: {
        kind: "og_rank",
        fid,
      },
    };

    const res = await fetch(
      "https://api.neynar.com/v2/farcaster/frame/transaction/pay",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": NEYNAR_API_KEY,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Neynar OG pay error:", res.status, text);
      return NextResponse.json(
        { error: "Failed to create Neynar OG pay frame" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const frameUrl = data?.transaction_frame?.url as string | undefined;
    const frameId = data?.transaction_frame?.id as string | undefined;

    if (!frameUrl || !frameId) {
      console.error("Invalid Neynar OG response:", data);
      return NextResponse.json(
        { error: "Invalid Neynar response" },
        { status: 500 }
      );
    }

    const { error: insertError } = await supabase.from("payments").insert({
      fid,
      kind: "og_rank",
      pack_size: null,
      frame_id: frameId,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Failed to insert OG payment record:", insertError);
    }

    return NextResponse.json({
      frameUrl,
      frameId,
    });
  } catch (error) {
    console.error("Error in /api/pay/og:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
