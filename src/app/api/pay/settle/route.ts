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
type NewBody = { paymentId: string; txHash: `0x${string}` };

type AnyBody = NewBody | LegacyBody;

function isTxHash(s: unknown): s is `0x${string}` {
  return (
    typeof s === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(s)
  );
}

function expectedAmountFrom(kind: "extra_picks" | "og_rank", packSize?: 1 | 5 | 10): bigint {
  if (kind === "og_rank") return parseUnits(OG_PRICE, 6);

  if (packSize === 1) return parseUnits(PRICE_1, 6);
  if (packSize === 5) return parseUnits(PRICE_5, 6);
  if (packSize === 10) return parseUnits(PRICE_10, 6);

  throw new Error("Invalid packSize for extra_picks");
}

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as AnyBody | null;

    const txHash = (body as any)?.txHash;
    const paymentId = (body as any)?.paymentId;

    if (!isTxHash(txHash)) {
      return NextResponse.json({ error: "Missing or invalid txHash" }, { status: 400 });
    }

    if (!RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json({ error: "Server misconfigured (missing env)" }, { status: 500 });
    }
    if (!isAddress(RECEIVER_ADDRESS) || !isAddress(USDC_CONTRACT)) {
      return NextResponse.json({ error: "Invalid RECEIVER/USDC address" }, { status: 500 });
    }

    const client = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });

    // 1) Tx + receipt (on-chain validáció)
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
        {
          error: "Wrong receiver",
          details: { expectedReceiver: RECEIVER_ADDRESS, actualReceiver: to },
        },
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

    // 2) Payment intent betöltés (preferált: paymentId alapján)
    let payment: {
      id: string;
      fid: number;
      kind: "extra_picks" | "og_rank";
      pack_size: 1 | 5 | 10 | null;
      tx_hash: string | null;
      status: string | null;
    } | null = null;

    if (typeof paymentId === "string" && paymentId.length > 0) {
      const { data, error } = await supabase
        .from("payments")
        .select("id,fid,kind,pack_size,tx_hash,status")
        .eq("id", paymentId)
        .maybeSingle();

      if (error || !data) {
        return NextResponse.json({ error: "Payment intent not found", details: error ?? null }, { status: 400 });
      }
      payment = data as any;
    } else {
      // Legacy fallback: fid/kind/(packSize) alapján megpróbálunk találni egy pending-et
      const fid = (body as any)?.fid;
      const kind = (body as any)?.kind as "extra_picks" | "og_rank" | undefined;
      const packSize = (body as any)?.packSize as 1 | 5 | 10 | undefined;

      if (!fid || !Number.isFinite(fid) || !kind) {
        return NextResponse.json(
          { error: "Missing paymentId. Legacy mode requires fid + kind (+ packSize for extra_picks)." },
          { status: 400 }
        );
      }

      const q = supabase
        .from("payments")
        .select("id,fid,kind,pack_size,tx_hash,status")
        .eq("fid", fid)
        .eq("kind", kind)
        .in("status", ["pending", "processing"]); // allow retry

      const { data, error } =
        kind === "extra_picks"
          ? await q.eq("pack_size", packSize ?? null).order("created_at", { ascending: false }).maybeSingle()
          : await q.order("created_at", { ascending: false }).maybeSingle();

      if (error || !data) {
        return NextResponse.json({ error: "No matching pending payment found (legacy mode)" }, { status: 400 });
      }
      payment = data as any;
    }

    // 3) Idempotencia: ha már completed, ok (ne kreditezzen duplán)
    if (payment.status === "completed") {
      // ha van eltérés tx-ben, jelezzük
      if (payment.tx_hash && payment.tx_hash.toLowerCase() !== txHash.toLowerCase()) {
        return NextResponse.json(
          { error: "Payment already completed with a different txHash", details: { existing: payment.tx_hash, incoming: txHash } },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: true, alreadyCompleted: true, txHash });
    }

    // 4) Ellenőrizd a várt amountot a payment alapján (ne body-ból!)
    const kind = payment.kind;
    const packSize = payment.pack_size ?? undefined;

    const exp = expectedAmountFrom(kind, packSize);
    if (amount !== exp) {
      return NextResponse.json(
        {
          error: "Wrong amount",
          details: {
            expected: exp.toString(),
            actual: amount.toString(),
            kind,
            packSize: packSize ?? null,
          },
        },
        { status: 400 }
      );
    }

    // 5) Lock: állítsuk "processing"-re + tx_hash set, hogy retry alatt se legyen dupla credit
    // Csak akkor lockolunk, ha:
    // - status pending VAGY processing (retry)
    // - ha tx_hash már be van állítva, akkor egyezzen
    if (payment.tx_hash && payment.tx_hash.toLowerCase() !== txHash.toLowerCase()) {
      return NextResponse.json(
        { error: "Payment already has a different txHash", details: { existing: payment.tx_hash, incoming: txHash } },
        { status: 409 }
      );
    }

    // próbáljunk lockolni: pending -> processing (vagy processing marad)
    const { data: lockData, error: lockErr } = await supabase
      .from("payments")
      .update({
        status: "processing",
        tx_hash: txHash,
        updated_at: nowIso(),
      })
      .eq("id", payment.id)
      .in("status", ["pending", "processing"])
      .select("id,status,tx_hash")
      .maybeSingle();

    if (lockErr || !lockData) {
      return NextResponse.json(
        { error: "Failed to lock payment for settlement", details: lockErr ?? null },
        { status: 500 }
      );
    }

    // 6) Kredit logika (exactly-once a "processing lock" miatt)
    if (kind === "extra_picks") {
      if (!packSize) {
        return NextResponse.json({ error: "Payment missing pack_size for extra_picks" }, { status: 500 });
      }

      const { data: stats, error: sErr } = await supabase
        .from("user_stats")
        .select("fid, extra_picks_remaining")
        .eq("fid", payment.fid)
        .maybeSingle();

      if (sErr || !stats) {
        return NextResponse.json({ error: "User stats missing" }, { status: 500 });
      }

      const current = Number(stats.extra_picks_remaining ?? 0);
      const next = current + Number(packSize);

      const { error: uErr } = await supabase
        .from("user_stats")
        .update({ extra_picks_remaining: next, updated_at: nowIso() })
        .eq("fid", payment.fid);

      if (uErr) {
        return NextResponse.json({ error: "Failed to credit picks", details: uErr }, { status: 500 });
      }

      // véglegesítés
      const { error: finErr } = await supabase
        .from("payments")
        .update({ status: "completed", updated_at: nowIso() })
        .eq("id", payment.id)
        .eq("tx_hash", txHash);

      if (finErr) {
        return NextResponse.json({ error: "Failed to finalize payment", details: finErr }, { status: 500 });
      }

      return NextResponse.json({ ok: true, credited: Number(packSize), txHash });
    }

    if (kind === "og_rank") {
      const { error: uErr } = await supabase
        .from("users")
        .update({ is_og: true })
        .eq("fid", payment.fid);

      if (uErr) {
        return NextResponse.json({ error: "Failed to set OG", details: uErr }, { status: 500 });
      }

      const { error: finErr } = await supabase
        .from("payments")
        .update({ status: "completed", updated_at: nowIso() })
        .eq("id", payment.id)
        .eq("tx_hash", txHash);

      if (finErr) {
        return NextResponse.json({ error: "Failed to finalize payment", details: finErr }, { status: 500 });
      }

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
