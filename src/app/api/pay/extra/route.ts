// src/app/api/pay/extra/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * ENV
 * (NE használj "!"-t itt, mert akkor nem tudunk normálisan debugolni hiányzó env-eket)
 */
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT;

const PRICE_1 = String(process.env.BBOX_EXTRA_PRICE_1 || "0.5"); // 1 pick
const PRICE_5 = String(process.env.BBOX_EXTRA_PRICE_5 || "2.0"); // 5 pick
const PRICE_10 = String(process.env.BBOX_EXTRA_PRICE_10 || "3.5"); // 10 pick

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Supabase admin client (service role)
 * Ha env hiányzik, nem crashelünk build-time, hanem a requestnél adunk értelmes hibát.
 */
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

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;
    const packSize = body?.packSize;

    // ---- Input validation ----
    if (!fid || !Number.isFinite(fid) || !isValidPackSize(packSize)) {
      return NextResponse.json(
        {
          error: "Missing/invalid fid or packSize",
          details: { fid, packSize },
        },
        { status: 400 }
      );
    }

    // ---- Env validation (Neynar) ----
    const missingNeynar = {
      NEYNAR_API_KEY: !NEYNAR_API_KEY,
      NEYNAR_PAY_RECEIVER_ADDRESS: !RECEIVER_ADDRESS,
      NEYNAR_USDC_CONTRACT: !USDC_CONTRACT,
    };

    if (missingNeynar.NEYNAR_API_KEY || missingNeynar.NEYNAR_PAY_RECEIVER_ADDRESS || missingNeynar.NEYNAR_USDC_CONTRACT) {
      return NextResponse.json(
        {
          error: "Server misconfigured (Neynar env missing)",
          missing: missingNeynar,
        },
        { status: 500 }
      );
    }

    // ---- Env validation (Supabase) ----
    const missingSupabase = {
      NEXT_PUBLIC_SUPABASE_URL: !SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !SUPABASE_SERVICE_ROLE_KEY,
    };

    // Nem kötelező a frame létrehozáshoz, de jó ha látod, mi hiányzik
    if (!supabase) {
      console.warn("[pay/extra] Supabase admin client not configured:", missingSupabase);
    }

    // ---- Amount & line item ----
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
    }

    // ---- Neynar payload ----
    const payload = {
      transaction: {
        to: {
          network: "base",
          address: RECEIVER_ADDRESS!,
          token_contract_address: USDC_CONTRACT!,
          amount, // string
        },
      },
      config: {
        line_items: [
          {
            name: lineItemName,
            description: `Extra BBOX picks for FID ${fid}`,
            image: `${BBOX_URL}/icon.png`, // stabil, ha a domain változik
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

    // ---- Call Neynar ----
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

    // Neynar request-id (ha van)
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
          // plusz: hogy lásd, mit küldtünk (csak a lényeg)
          details: {
            fid,
            packSize,
            amount,
            receiver: RECEIVER_ADDRESS,
            usdc: USDC_CONTRACT,
            endpoint: url,
          },
        },
        // 502: upstream (Neynar) hibára jobb jelzés, mint a 500
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

    // ---- Payment record (best effort) ----
    if (supabase) {
      const { error: insertError } = await supabase.from("payments").insert({
        fid,
        kind: "extra_picks",
        pack_size: packSize,
        frame_id: frameId,
        status: "pending",
      });

      if (insertError) {
        console.error("[pay/extra] Failed to insert payment record:", insertError);
        // nem állítjuk meg a flow-t, attól még tudsz fizetni
      }
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
      {
        error: "Internal server error",
        details: String(error?.message ?? error),
      },
      { status: 500 }
    );
  }
}

/**
 * kis helper: a BBOX_URL-t itt is használd (line_items image-hez)
 * (ha át akarod nevezni, nyugodtan)
 */
const BBOX_URL = "https://box-sage.vercel.app";
