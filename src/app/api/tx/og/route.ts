// src/app/api/tx/og/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;
const OG_PRICE = String(process.env.BBOX_OG_PRICE || "5.0");

const CHAIN_ID = 8453; // Base mainnet

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = { fid: number };

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

function parseUsdcAmountToUnits(amountStr: string): bigint {
  const s = amountStr.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount format: ${amountStr}`);
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "000000").slice(0, 6);
  const combined = whole + fracPadded;
  const normalized = combined.replace(/^0+/, "") || "0";
  return BigInt(normalized);
}

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

    if (!fid || !Number.isFinite(fid)) {
      return NextResponse.json({ error: "Missing fid" }, { status: 400 });
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

    const amountUnits = parseUsdcAmountToUnits(OG_PRICE);
    const data = encodeErc20Transfer(RECEIVER_ADDRESS, amountUnits);

    const { error: insertError } = await supabase.from("payments").insert({
      fid,
      kind: "og_rank",
      pack_size: null,
      frame_id: "pending_native",
      status: "pending",
    });

    if (insertError) console.error("payments insert error:", insertError);

    return NextResponse.json({
      tx: {
        chainId: CHAIN_ID,
        to: USDC_CONTRACT,
        data,
        value: "0x0",
      },
      details: {
        fid,
        kind: "og_rank",
        amount: OG_PRICE,
        amountUnits: amountUnits.toString(),
        receiver: RECEIVER_ADDRESS,
        token: USDC_CONTRACT,
      },
    });
  } catch (e: any) {
    console.error("Error in /api/tx/og:", e);
    return NextResponse.json(
      { error: "Internal server error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
