// src/app/api/pay/extra/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encodeFunctionData, parseUnits } from "viem";

export const runtime = "nodejs";

const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;

// ezek nálad már mennek env-ből
const PRICE_1 = String(process.env.BBOX_EXTRA_PRICE_1 || "0.5");
const PRICE_5 = String(process.env.BBOX_EXTRA_PRICE_5 || "2.0");
const PRICE_10 = String(process.env.BBOX_EXTRA_PRICE_10 || "3.5");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = {
  fid: number;
  packSize: 1 | 5 | 10;
};

const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "ok", type: "bool" }],
  },
] as const;

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
        { error: "Server misconfigured (missing RECEIVER/USDC env)" },
        { status: 500 }
      );
    }

    let amountStr: string;
    switch (packSize) {
      case 1:
        amountStr = PRICE_1;
        break;
      case 5:
        amountStr = PRICE_5;
        break;
      case 10:
        amountStr = PRICE_10;
        break;
      default:
        return NextResponse.json({ error: "Invalid packSize" }, { status: 400 });
    }

    // USDC decimals = 6
    const amount = parseUnits(amountStr, 6);

    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [RECEIVER_ADDRESS as `0x${string}`, amount],
    });

    // payments record (pending) — txHash majd settle-ben kerül be
    const { error: insertError } = await supabase.from("payments").insert({
      fid,
      kind: "extra_picks",
      pack_size: packSize,
      frame_id: null,
      status: "pending",
    });

    if (insertError) console.error("Failed to insert payment record:", insertError);

    return NextResponse.json({
      tx: {
        chainId: 8453,
        to: USDC_CONTRACT as `0x${string}`,
        data: data as `0x${string}`,
        value: "0x0",
      },
      details: {
        fid,
        packSize,
        amount: amountStr,
        receiver: RECEIVER_ADDRESS,
        token: "USDC",
        chainId: 8453,
      },
    });
  } catch (error) {
    console.error("Error in /api/pay/extra:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
