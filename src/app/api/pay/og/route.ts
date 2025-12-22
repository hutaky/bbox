// src/app/api/pay/og/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT;
const OG_PRICE_STR = process.env.BBOX_OG_PRICE || "5.0";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

type Body = { fid: number };

function toAmountNumber(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;

    if (!fid || !Number.isFinite(fid)) {
      return NextResponse.json({ error: "Missing/invalid fid", details: { fid } }, { status: 400 });
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

    const amount = toAmountNumber(OG_PRICE_STR);
    if (!amount) {
      return NextResponse.json(
        { error: "Invalid OG price env (must be positive number)", details: { OG_PRICE_STR } },
        { status: 500 }
      );
    }

    const payload = {
      transaction: {
        to: {
          network: "base",
          address: RECEIVER_ADDRESS!,
          token_contract_address: USDC_CONTRACT!,
          amount, // ✅ NUMBER
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
      console.error("[pay/og] Neynar pay error:", {
        status: res.status,
        requestId,
        body: parsed,
        ms: Date.now() - startedAt,
      });

      return NextResponse.json(
        {
          error: "Failed to create Neynar OG pay frame",
          neynarStatus: res.status,
          neynarRequestId: requestId,
          neynarBody: parsed,
          details: {
            fid,
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
      console.error("[pay/og] Invalid Neynar response (missing url/id):", {
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
        kind: "og_rank",
        pack_size: null,
        frame_id: frameId,
        status: "pending",
      });

      if (insertError) console.error("[pay/og] Failed to insert OG payment record:", insertError);
    }

    return NextResponse.json({
      frameUrl,
      frameId,
      neynarRequestId: requestId,
      ms: Date.now() - startedAt,
    });
  } catch (error: any) {
    console.error("Error in /api/pay/og:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error?.message ?? error) },
      { status: 500 }
    );
  }
}
