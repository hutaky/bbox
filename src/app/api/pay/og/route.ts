// src/app/api/pay/og/route.ts
import { NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const TREASURY_ADDRESS = process.env.BBOX_TREASURY_ADDRESS;
const TOKEN_CONTRACT = process.env.BBOX_TOKEN_CONTRACT;

// OG rank ára (ETH-ben – WETH contract)
const OG_PRICE = 0.01; // kb 30 USD, nyugodtan állítsd amit szeretnél

export async function POST(req: Request) {
  try {
    if (!NEYNAR_API_KEY || !TREASURY_ADDRESS || !TOKEN_CONTRACT) {
      console.error("Missing env vars for Neynar Pay");
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { fid } = body as { fid?: number };

    if (!fid) {
      return NextResponse.json(
        { error: "Missing fid" },
        { status: 400 }
      );
    }

    const idem = crypto.randomUUID();

    const payload = {
      transaction: {
        to: {
          address: TREASURY_ADDRESS,
          network: "base",
          token_contract_address: TOKEN_CONTRACT,
          amount: OG_PRICE
        }
      },
      config: {
        allowlist_fids: [fid],
        line_items: [
          {
            name: "BBOX OG Rank",
            description: `Permanent OG buff for FID ${fid} (extra daily free box)`,
            image: "https://box-sage.vercel.app/icon.png"
          }
        ],
        action: {
          text: "Become OG",
          text_color: "#FFFFFF",
          button_color: "#7C3AED" // lilás OG vibe
        }
      },
      idem
    };

    const res = await fetch(
      "https://api.neynar.com/v2/farcaster/frame/transaction/pay/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": NEYNAR_API_KEY
        },
        body: JSON.stringify(payload)
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("Neynar OG Pay error:", res.status, text);
      return NextResponse.json(
        { error: "Failed to create OG payment mini app" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const frameUrl = data?.transaction_frame?.url as string | undefined;

    if (!frameUrl) {
      console.error("No frame URL in Neynar OG response", data);
      return NextResponse.json(
        { error: "Invalid response from Neynar" },
        { status: 500 }
      );
    }

    return NextResponse.json({ frameUrl });
  } catch (err) {
    console.error("Error in /api/pay/og:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
