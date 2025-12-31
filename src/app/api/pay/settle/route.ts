// src/app/api/pay/settle/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, decodeFunctionData, http, isAddress } from "viem";
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

type Body =
  | { fid: number; kind: "extra_picks"; packSize: 1 | 5 | 10; txHash: `0x${string}` }
  | { fid: number; kind: "og_rank"; txHash: `0x${string}` };

function toUnits6(s: string): bigint {
  const [a, b = ""] = s.split(".");
  const frac = (b + "000000").slice(0, 6);
  return BigInt(a) * 1000000n + BigInt(frac);
}

function expectedAmount(kind: Body["kind"], packSize?: 1 | 5 | 10): bigint {
  if (kind === "og_rank") return toUnits6(OG_PRICE);
  if (packSize === 1) return toUnits6(PRICE_1);
  if (packSize === 5) return toUnits6(PRICE_5);
  if (packSize === 10) return toUnits6(PRICE_10);
  throw new Error("Invalid packSize");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;

    const fid = (body as any)?.fid;
    const kind = (body as any)?.kind as Body["kind"] | undefined;
    const txHash = (body as any)?.txHash as `0x${string}` | undefined;
    const packSize = (body as any)?.packSize as 1 | 5 | 10 | undefined;

    if (!fid || !Number.isFinite(fid) || !kind || !txHash) {
      return NextResponse.json({ error: "Missing fid/kind/txHash" }, { status: 400 });
    }

    if (!RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json({ error: "Server misconfigured (missing env)" }, { status: 500 });
    }

    if (!isAddress(RECEIVER_ADDRESS) || !isAddress(USDC_CONTRACT)) {
      return NextResponse.json({ error: "Invalid RECEIVER/USDC address" }, { status: 500 });
    }

    // 0) IDEMPOTENCIA: ha tx_hash már completed → ok
    const { data: existingPay, error: exErr } = await supabase
      .from("payments")
      .select("id, status, kind, pack_size, fid, tx_hash")
      .eq("tx_hash", txHash)
      .maybeSingle();

    if (exErr) console.error("payments lookup by tx_hash error:", exErr);

    if (existingPay?.status === "completed") {
      return NextResponse.json({ ok: true, alreadyProcessed: true, txHash });
    }

    const client = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });

    // Tx + receipt
    const tx = await client.getTransaction({ hash: txHash }).catch(() => null);
    if (!tx) {
      return NextResponse.json(
        { error: "Transaction not found yet", hint: "Wait 3-10 seconds, then try again." },
        { status: 400 }
      );
    }

    // USDC contract call expected
    if ((tx.to || "").toLowerCase() !== USDC_CONTRACT.toLowerCase()) {
      return NextResponse.json(
        { error: "Wrong contract", details: { expectedTo: USDC_CONTRACT, actualTo: tx.to } },
        { status: 400 }
      );
    }

    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input });
    if (decoded.functionName !== "transfer") {
      return NextResponse.json({ error: "Not an ERC20 transfer" }, { status: 400 });
    }

    const [to, amount] = decoded.args as [`0x${string}`, bigint];

    if (to.toLowerCase() !== RECEIVER_ADDRESS.toLowerCase()) {
      return NextResponse.json(
        { error: "Wrong receiver", details: { expectedReceiver: RECEIVER_ADDRESS, actualReceiver: to } },
        { status: 400 }
      );
    }

    const exp = expectedAmount(kind, packSize);
    if (amount !== exp) {
      return NextResponse.json(
        { error: "Wrong amount", details: { expected: exp.toString(), actual: amount.toString(), kind, packSize } },
        { status: 400 }
      );
    }

    const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
    if (!receipt || receipt.status !== "success") {
      return NextResponse.json(
        {
          error: "Transaction not successful yet",
          hint: "Wait 3-10 seconds, then try again.",
          details: { status: receipt?.status ?? "missing" },
        },
        { status: 400 }
      );
    }

    // --- DB credit (1x) + payment completed ---
    const nowIso = new Date().toISOString();

    if (kind === "extra_picks") {
      const add = packSize ?? 0;

      // kredit
      const { data: stats, error: sErr } = await supabase
        .from("user_stats")
        .select("fid, extra_picks_remaining")
        .eq("fid", fid)
        .maybeSingle();

      if (sErr || !stats) {
        return NextResponse.json({ error: "User stats missing" }, { status: 500 });
      }

      const current = Number(stats.extra_picks_remaining ?? 0);
      const next = current + add;

      const { error: uErr } = await supabase
        .from("user_stats")
        .update({ extra_picks_remaining: next, updated_at: nowIso })
        .eq("fid", fid);

      if (uErr) return NextResponse.json({ error: "Failed to credit picks", details: uErr }, { status: 500 });

      // payment: tx_hash + completed (ha nincs is előzetes row, akkor is létrehozzuk)
      await supabase
        .from("payments")
        .insert({
          fid,
          kind: "extra_picks",
          pack_size: packSize ?? null,
          frame_id: null,
          tx_hash: txHash,
          status: "completed",
        })
        .catch(() => null);

      // és az esetlegesen létező "pending" sorokat is lezárjuk
      await supabase
        .from("payments")
        .update({ status: "completed", tx_hash: txHash, updated_at: nowIso })
        .eq("fid", fid)
        .eq("kind", "extra_picks")
        .eq("pack_size", packSize ?? null)
        .eq("status", "pending");

      return NextResponse.json({ ok: true, credited: add, txHash });
    }

    if (kind === "og_rank") {
      const { error: uErr } = await supabase.from("users").update({ is_og: true }).eq("fid", fid);
      if (uErr) return NextResponse.json({ error: "Failed to set OG", details: uErr }, { status: 500 });

      await supabase
        .from("payments")
        .insert({
          fid,
          kind: "og_rank",
          pack_size: null,
          frame_id: null,
          tx_hash: txHash,
          status: "completed",
        })
        .catch(() => null);

      await supabase
        .from("payments")
        .update({ status: "completed", tx_hash: txHash, updated_at: nowIso })
        .eq("fid", fid)
        .eq("kind", "og_rank")
        .eq("status", "pending");

      return NextResponse.json({ ok: true, txHash });
    }

    return NextResponse.json({ error: "Unsupported kind" }, { status: 400 });
  } catch (e: any) {
    console.error("Error in /api/pay/settle:", e);
    return NextResponse.json(
      { error: "Internal server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
