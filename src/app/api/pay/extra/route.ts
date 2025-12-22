// src/app/api/pay/extra/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT;

// env-ből jönnek, de NUMBER kell Neynar-nek
const PRICE_1 = process.env.BBOX_EXTRA_PRICE_1 || "0.5"; // 1 pick
const PRICE_5 = process.env.BBOX_EXTRA_PRICE_5 || "2.0"; // 5 pick
const PRICE_10 = process.env.BBOX_EXTRA_PRICE_10 || "3.5"; // 10 pick

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

type Body = {
  fid: number;
  packSize: 1 | 5 | 10;
};

function isValidPackSize(x: any): x is 1 | 5 | 10 {
  return x === 1 || x === 5 || x === 10;
}

function toAmountNumber(v: string): number | null {
  // "0.5" -> 0.5, "2.0" -> 2, stb.
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;
    const packSize = body?.packSize;

    if (!fid || !Number.isFinite(fid) || !isValidPackSize(packSize)) {
      return NextResponse.json(
        { error: "Missing/invalid fid or packSize", details: { fid, packSize } },
        { status: 400 }
      );
    }

    const missingNeynar = {
      NEYNAR_API_KEY: !NEYNAR_API_KEY,
      NEYNAR_PAY_RECEIVER_ADDRESS: !RECEIVER_ADDRESS,
      NEYNAR_USDC_CONTRACT: !USDC_CONTRACT,
    };

    if (
      missingNeynar.NEYNAR_API_KEY ||
      missingNeynar.NEYNAR_PAY_RECEIVER_ADDRESS ||
      missingNeynar.NEYNAR_USDC_CONTRACT
    ) {
      return NextResponse.json(
        { error: "Server misconfigured (Neynar env missing)", missing: missingNeynar },
        { status: 500 }
      );
    }

    let amountStr: string;
    let lineItemName: string;

    switch (packSize) {
      case 1:
        amountStr = PRICE_1;
        lineItemName = "BBOX Extra Picks · 1";
        break;
      case 5:
        amountStr = PRICE_5;
        lineItemName = "BBOX Extra Picks · 5";
        break;
      case 10:
        amountStr = PRICE_10;
        lineItemName = "BBOX Extra Picks · 10";
        break;
    }

    const amount = toAmountNumber(amountStr);
    if (!amount) {
      return NextResponse.json(
        {
          error: "Invalid price env (amount must be a positive number)",
          details: { packSize, amountStr },
        },
        { status: 500 }
      );
    }

    const payload = {
      transaction: {
        to: {
          network: "base",
          address: RECEIVER_ADDRESS!,
          token_contract_address: USDC_CONTRACT!,
          amount, // ✅ NUMBER (nem string)
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

    const url = "https://api.neynar.com/v2/farcaster/frame/transaction/pay";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": NEYNAR_API_KEY!,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await res.text().catch(() => "");
    let parsed: any = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = rawText || null;
    }

    const requestId =
      res.headers.get("x-request-id") ||
      res.headers.get("x-neynar-request-id") ||
      res.headers.get("cf-ray") ||
      null;

    if (!res.ok) {
      console.error("[pay/extra] Neynar pay error:", {
        status: res.status,
        requestId,
        body: parsed,
        ms: Date.now() - startedAt,
      });

      return NextResponse.json(
        {
          error: "Failed to create Neynar pay frame",
          neynarStatus: res.status,
          neynarRequestId: requestId,
          neynarBody: parsed,
          details: {
            fid,
            packSize,
            amount,
            receiver: RECEIVER_ADDRESS,
            usdc: USDC_CONTRACT,
            endpoint: url,
          },
        },
        { status: 502 }
      );
    }

    const frameUrl = parsed?.transaction_frame?.url as string | undefined;
    const frameId = parsed?.transaction_frame?.id as string | undefined;

    if (!frameUrl || !frameId) {
      console.error("[pay/extra] Invalid Neynar response (missing url/id):", {
        requestId,
        body: parsed,
      });

      return NextResponse.json(
        {
          error: "Invalid Neynar response (missing frameUrl/frameId)",
          neynarRequestId: requestId,
          neynarBody: parsed,
        },
        { status: 502 }
      );
    }

    // best-effort payment record
    if (supabase) {
      const { error: insertError } = await supabase.from("payments").insert({
        fid,
        kind: "extra_picks",
        pack_size: packSize,
        frame_id: frameId,
        status: "pending",
      });

      if (insertError) console.error("[pay/extra] Failed to insert payment record:", insertError);
    }

    return NextResponse.json({
      frameUrl,
      frameId,
      neynarRequestId: requestId,
      ms: Date.now() - startedAt,
    });
  } catch (error: any) {
    console.error("Error in /api/pay/extra:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
