// src/app/api/tx/extra/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!; // ugyanazt használjuk receivernek
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!; // USDC token contract Base-en

const PRICE_1 = String(process.env.BBOX_EXTRA_PRICE_1 || "0.5");
const PRICE_5 = String(process.env.BBOX_EXTRA_PRICE_5 || "2.0");
const PRICE_10 = String(process.env.BBOX_EXTRA_PRICE_10 || "3.5");

const CHAIN_ID = 8453; // Base mainnet

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = {
  fid: number;
  packSize: 1 | 5 | 10;
};

// ---- helpers (no deps) ----
function isHexAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

function strip0x(s: string) {
  return s.startsWith("0x") ? s.slice(2) : s;
}

function pad32(hexNo0x: string) {
  return hexNo0x.padStart(64, "0");
}

/**
 * USDC has 6 decimals.
 * Convert decimal string ("0.5") -> bigint of base units (500000)
 */
function parseUsdcAmountToUnits(amountStr: string): bigint {
  const s = amountStr.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount format: ${amountStr}`);
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  const combined = whole + fracPadded;
  // remove leading zeros
  const normalized = combined.replace(/^0+/, "") || "0";
  return BigInt(normalized);
}

/**
 * ERC20 transfer(address to, uint256 amount)
 * selector: a9059cbb
 */
function encodeErc20Transfer(to: string, amount: bigint): `0x${string}` {
  const selector = "a9059cbb";
  const toNo0x = strip0x(to).toLowerCase();
  const amtHex = amount.toString(16);
  const data = selector + pad32(toNo0x) + pad32(amtHex);
  return `0x${data}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;
    const packSize = body?.packSize;

    if (!fid || !Number.isFinite(fid) || !packSize) {
      return NextResponse.json({ error: "Missing fid or packSize" }, { status: 400 });
    }

    if (!RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json(
        {
          error: "Server misconfigured (missing env)",
          missing: {
            NEYNAR_PAY_RECEIVER_ADDRESS: !RECEIVER_ADDRESS,
            NEYNAR_USDC_CONTRACT: !USDC_CONTRACT,
          },
        },
        { status: 500 }
      );
    }

    if (!isHexAddress(RECEIVER_ADDRESS) || !isHexAddress(USDC_CONTRACT)) {
      return NextResponse.json(
        { error: "Bad env address format (receiver/usdc)" },
        { status: 500 }
      );
    }

    let price: string;
    switch (packSize) {
      case 1:
        price = PRICE_1;
        break;
      case 5:
        price = PRICE_5;
        break;
      case 10:
        price = PRICE_10;
        break;
      default:
        return NextResponse.json({ error: "Invalid packSize" }, { status: 400 });
    }

    const amountUnits = parseUsdcAmountToUnits(price);
    const data = encodeErc20Transfer(RECEIVER_ADDRESS, amountUnits);

    // Create a pending payment row (tx hash later)
    // frame_id mezőt majd txHash-sel töltjük confirm után, itt csak "pending_native"
    const { error: insertError } = await supabase.from("payments").insert({
      fid,
      kind: "extra_picks",
      pack_size: packSize,
      frame_id: "pending_native",
      status: "pending",
    });

    if (insertError) {
      console.error("payments insert error:", insertError);
      // nem halunk bele, csak log
    }

    return NextResponse.json({
      tx: {
        chainId: CHAIN_ID,
        to: USDC_CONTRACT,
        data,
        value: "0x0",
      },
      details: {
        fid,
        kind: "extra_picks",
        packSize,
        amount: price,
        amountUnits: amountUnits.toString(),
        receiver: RECEIVER_ADDRESS,
        token: USDC_CONTRACT,
      },
    });
  } catch (e: any) {
    console.error("Error in /api/tx/extra:", e);
    return NextResponse.json(
      { error: "Internal server error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
