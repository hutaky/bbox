// src/app/api/pay/settle/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  decodeFunctionData,
  http,
  isAddress,
  parseUnits,
} from "viem";
import { base } from "viem/chains";

export const runtime = "nodejs";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;

const PRICE_1 = String(process.env.BBOX_EXTRA_PRICE_1 || "0.5");
const PRICE_5 = String(process.env.BBOX_EXTRA_PRICE_5 || "2.0");
const PRICE_10 = String(process.env.BBOX_EXTRA_PRICE_10 || "3.5");
const OG_PRICE = String(process.env.BBOX_OG_PRICE || "5.0");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

type LegacyBody =
  | {
      fid: number;
      kind: "extra_picks";
      packSize: 1 | 5 | 10;
      txHash: `0x${string}`;
    }
  | { fid: number; kind: "og_rank"; txHash: `0x${string}` };

// ÚJ ajánlott body (prepare endpointok paymentId-t adnak vissza)
type NewBody = { paymen
