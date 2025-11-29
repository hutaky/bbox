// src/app/api/pay/extra/route.ts
import { NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const TREASURY_ADDRESS = process.env.BBOX_TREASURY_ADDRESS;
const TOKEN_CONTRACT = process.env.BBOX_TOKEN_CONTRACT;

// Árak (ETH-ben – WETH contracton keresztül megy)
const PACKAGE_PRICES: Record<"1" | "5" | "10", number> = {
  "1": 0.0005, // 1 pick
  "5": 0.002,  // 5 picks (olcsóbb / pick)
  "10": 0.0035 // 10 picks (még olcsóbb / pick)
};

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
    const { fid, packageType } = body as {
      fid?: number;
      packageType?: "1" | "5" | "10";
    };

    if (!packageType || !PACKAGE_PRICES[packageType]) {
      return NextResponse.json(
        { error: "Invalid packageType" },
        { status: 400 }
      );
    }

    const amount = PACKAGE_PRICES[packageType];

    // Idempotency key
    const idem = crypto.randomUUID();

    const payload = {
      transaction: {
        to: {
          address: TREASURY_ADDRESS,
          network: "base", // Base lánc
          token_contract_address: TOKEN_CONTRACT,
          amount
        }
      },
      config: {
        // opcionális, de hasznos: csak az adott FID fizethessen
        allowlist_fids: fid ? [fid] : [],
        line_items: [
          {
            name: `Extra picks (${packageType})`,
            description: `BBOX extra box openings (${packageType} picks)${
              fid ? ` for FID ${fid}` : ""
            }`,
            // tetszőleges kép – használhatod a saját splash / icon URL-edet
            image: "https://box-sage.vercel.app/splash.png"
          }
        ],
        action: {
          text: "Pay",
          text_color: "#FFFFFF",
          button_color: "#0052FF"
        }
      },
      // idempotency key – ha újraküldöd ugyanazzal, nem jön duplikált frame
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
      console.error("Neynar Pay error:", res.status, text);
      return NextResponse.json(
        { error: "Failed to create payment mini app" },
        { status: 500 }
      );
    }

    const data = await res.json();

    const frameUrl = data?.transaction_frame?.url as string | undefined;
    if (!frameUrl) {
      console.error("No frame URL in Neynar response", data);
      return NextResponse.json(
        { error: "Invalid response from Neynar" },
        { status: 500 }
      );
    }

    return NextResponse.json({ frameUrl });
  } catch (err) {
    console.error("Error in /api/pay/extra:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
