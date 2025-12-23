// src/app/api/pay/og/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encodeFunctionData, parseUnits } from "viem";

export const runtime = "nodejs";

const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;
const OG_PRICE = String(process.env.BBOX_OG_PRICE || "5.0");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = { fid: number };

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

    if (!fid || !Number.isFinite(fid)) {
      return NextResponse.json({ error: "Missing fid" }, { status: 400 });
    }

    if (!RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json(
        { error: "Server misconfigured (missing RECEIVER/USDC env)" },
        { status: 500 }
      );
    }

    const amount = parseUnits(OG_PRICE, 6);

    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [RECEIVER_ADDRESS as `0x${string}`, amount],
    });

    const { error: insertError } = await supabase.from("payments").insert({
      fid,
      kind: "og_rank",
      pack_size: null,
      frame_id: null,
      status: "pending",
    });

    if (insertError) console.error("Failed to insert OG payment record:", insertError);

    return NextResponse.json({
      tx: {
        chainId: 8453,
        to: USDC_CONTRACT as `0x${string}`,
        data: data as `0x${string}`,
        value: "0x0",
      },
      details: {
        fid,
        amount: OG_PRICE,
        receiver: RECEIVER_ADDRESS,
        token: "USDC",
        chainId: 8453,
      },
    });
  } catch (error) {
    console.error("Error in /api/pay/og:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
