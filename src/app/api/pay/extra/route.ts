// src/app/api/pay/extra/route.ts
import { NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!;
const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;

const PRICE_1 = Number(process.env.BBOX_EXTRA_PRICE_1 || "0.5");   // 1 pick
const PRICE_5 = Number(process.env.BBOX_EXTRA_PRICE_5 || "2.0");   // 5 pick
const PRICE_10 = Number(process.env.BBOX_EXTRA_PRICE_10 || "3.5"); // 10 pick

export const runtime = "nodejs";

type Body = {
  fid: number;
  packSize: 1 | 5 | 10;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { fid, packSize } = body;

    if (!fid || !packSize) {
      return NextResponse.json(
        { error: "Missing fid or packSize" },
        { status: 400 }
      );
    }

    if (!NEYNAR_API_KEY || !RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json(
        { error: "Server misconfigured (Neynar / payment envs missing)" },
        { status: 500 }
      );
    }

    let amount: number;
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
        return NextResponse.json(
          { error: "Invalid packSize" },
          { status: 400 }
        );
    }

    const payload = {
      transaction: {
        to: {
          network: "base",
          address: RECEIVER_ADDRESS,
          token_contract_address: USDC_CONTRACT,
          amount, // USDC amount in whole units (USDC = 6 decimals, Neynar oldal kezeli)
        },
      },
      config: {
        line_items: [
          {
            name: lineItemName,
            description: `Extra BBOX picks for FID ${fid}`,
            image:
              "https://box-sage.vercel.app/icon.png", // vagy bármilyen promó kép
          },
        ],
        action: {
          text: "Pay with USDC",
          text_color: "#FFFFFF",
          button_color: "#0052FF",
        },
      },
      // Opcionális: metadata, amit visszakapsz a webhookban
      metadata: {
        kind: "extra_picks",
        fid,
        pack_size: packSize,
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
      console.error("Neynar pay error:", res.status, text);
      return NextResponse.json(
        { error: "Failed to create Neynar pay frame" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const frameUrl = data?.transaction_frame?.url as string | undefined;
    const frameId = data?.transaction_frame?.id as string | undefined;

    if (!frameUrl) {
      console.error("Invalid Neynar pay response:", data);
      return NextResponse.json(
        { error: "Invalid Neynar response" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      frameUrl,
      frameId,
    });
  } catch (error) {
    console.error("Error in /api/pay/extra:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
