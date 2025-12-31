// src/app/api/pay/settle/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, decodeFunctionData, http, isAddress } from "viem";
import { base } from "viem/chains";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

// 10 perc után a “pending” purchase-t tekintsük megszakadtnak
const PENDING_TTL_MINUTES = 10;

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
  | {
      fid: number;
      kind: "extra_picks";
      packSize: 1 | 5 | 10;
      txHash: `0x${string}`;
    }
  | { fid: number; kind: "og_rank"; txHash: `0x${string}` };

function toUnits6(s: string): bigint {
  const [a, b = ""] = s.split(".");
  const frac = (b + "000000").slice(0, 6);
  return BigInt(a || "0") * 1000000n + BigInt(frac || "0");
}

function expectedAmount(kind: Body["kind"], packSize?: 1 | 5 | 10): bigint {
  if (kind === "og_rank") return toUnits6(OG_PRICE);
  if (packSize === 1) return toUnits6(PRICE_1);
  if (packSize === 5) return toUnits6(PRICE_5);
  if (packSize === 10) return toUnits6(PRICE_10);
  throw new Error("Invalid packSize");
}

function isoMinutesAgo(mins: number) {
  return new Date(Date.now() - mins * 60 * 1000).toISOString();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;

    const fid = Number((body as any)?.fid);
    const kind = (body as any)?.kind as Body["kind"] | undefined;
    const txHash = (body as any)?.txHash as `0x${string}` | undefined;
    const packSize = (body as any)?.packSize as 1 | 5 | 10 | undefined;

    if (!fid || !Number.isFinite(fid) || !kind || !txHash) {
      return NextResponse.json(
        { error: "Missing fid/kind/txHash" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ Rate limit (SETTLE)
    const rl = await enforceRateLimit(req, {
      action: `pay_settle_${kind}`,
      fid,
      windowSeconds: 60,
      ipLimit: 30,
      fidLimit: 15,
    });
    if (rl) return rl;

    if (!RECEIVER_ADDRESS || !USDC_CONTRACT) {
      return NextResponse.json(
        { error: "Server misconfigured (missing env)" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!isAddress(RECEIVER_ADDRESS) || !isAddress(USDC_CONTRACT)) {
      return NextResponse.json(
        { error: "Invalid RECEIVER/USDC address" },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    // --- 0) Idempotencia: ha már volt ilyen txHash feldolgozva, ne krediteljünk újra ---
    {
      const { data: already, error: aErr } = await supabase
        .from("payments")
        .select("id, status")
        .eq("frame_id", txHash)
        .maybeSingle();

      if (aErr) console.warn("payments idempotency check error:", aErr);

      if (already?.status === "completed") {
        return NextResponse.json(
          { ok: true, txHash, alreadyProcessed: true },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    }

    // --- 1) régi pending sorok lezárása ---
    try {
      const cutoff = isoMinutesAgo(PENDING_TTL_MINUTES);

      await supabase
        .from("payments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("fid", fid)
        .eq("status", "pending")
        .lt("created_at", cutoff);
    } catch (e) {
      console.warn("pending cleanup failed (non-fatal):", e);
    }

    const client = createPublicClient({
      chain: base,
      transport: http(RPC_URL),
    });

    // --- 2) Tx lekérés ---
    const tx = await client.getTransaction({ hash: txHash }).catch(() => null);
    if (!tx) {
      return NextResponse.json(
        { error: "Transaction not found yet", hint: "Wait 3-10 seconds, then try again." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // ✅ SENDER-CHECK (TX.FROM == users.address) ---
    // Ha még nincs eltárolva address, nem blokkolunk.
    // Ha van és nem egyezik, akkor reject (különben bárki más txHash-ét beadhatná).
    {
      const { data: u, error: uErr } = await supabase
        .from("users")
        .select("address")
        .eq("fid", fid)
        .maybeSingle();

      if (uErr) console.warn("users select address error:", uErr);

      const stored = (u?.address || "").trim();
      const from = (tx.from || "").toLowerCase();

      if (stored) {
        const storedLower = stored.toLowerCase();
        // csak akkor szigorítunk, ha a stored address valid
        if (isAddress(storedLower as `0x${string}`) && from && storedLower !== from) {
          return NextResponse.json(
            {
              error: "Wrong sender",
              details: { expectedFrom: stored, actualFrom: tx.from, fid },
            },
            { status: 400, headers: { "Cache-Control": "no-store" } }
          );
        }
      }
    }

    // USDC contract call expected
    if ((tx.to || "").toLowerCase() !== USDC_CONTRACT.toLowerCase()) {
      return NextResponse.json(
        { error: "Wrong contract", details: { expectedTo: USDC_CONTRACT, actualTo: tx.to } },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input });
    if (decoded.functionName !== "transfer") {
      return NextResponse.json(
        { error: "Not an ERC20 transfer" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const [to, amount] = decoded.args as [`0x${string}`, bigint];

    if (to.toLowerCase() !== RECEIVER_ADDRESS.toLowerCase()) {
      return NextResponse.json(
        { error: "Wrong receiver", details: { expectedReceiver: RECEIVER_ADDRESS, actualReceiver: to } },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const exp = expectedAmount(kind, packSize);
    if (amount !== exp) {
      return NextResponse.json(
        { error: "Wrong amount", details: { expected: exp.toString(), actual: amount.toString(), kind, packSize } },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // --- 3) Receipt ---
    const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
    if (!receipt || receipt.status !== "success") {
      return NextResponse.json(
        {
          error: "Transaction not successful yet",
          hint: "Wait 3-10 seconds, then try again.",
          details: { status: receipt?.status ?? "missing" },
        },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // --- 4) DB credit + payments update ---
    if (kind === "extra_picks") {
      const add = packSize ?? 0;

      const { data: stats, error: sErr } = await supabase
        .from("user_stats")
        .select("fid, extra_picks_remaining")
        .eq("fid", fid)
        .maybeSingle();

      if (sErr || !stats) {
        return NextResponse.json(
          { error: "User stats missing" },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }

      const current = Number(stats.extra_picks_remaining ?? 0);
      const next = current + add;

      const { error: uErr } = await supabase
        .from("user_stats")
        .update({ extra_picks_remaining: next, updated_at: new Date().toISOString() })
        .eq("fid", fid);

      if (uErr) {
        return NextResponse.json(
          { error: "Failed to credit picks", details: uErr },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }

      const { data: updatedRows, error: pErr } = await supabase
        .from("payments")
        .update({ status: "completed", frame_id: txHash, updated_at: new Date().toISOString() })
        .eq("fid", fid)
        .eq("kind", "extra_picks")
        .eq("pack_size", packSize ?? null)
        .eq("status", "pending")
        .select("id");

      if (pErr) console.warn("payments update (extra_picks) error:", pErr);

      if (!updatedRows || updatedRows.length === 0) {
        const { error: insErr } = await supabase.from("payments").insert({
          fid,
          kind: "extra_picks",
          pack_size: packSize ?? null,
          frame_id: txHash,
          status: "completed",
        });
        if (insErr) console.warn("payments insert (extra_picks completed) error:", insErr);
      }

      return NextResponse.json(
        { ok: true, credited: add, txHash },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (kind === "og_rank") {
      // users tábládban nincs updated_at → csak is_og
      const { error: uErr } = await supabase
        .from("users")
        .update({ is_og: true })
        .eq("fid", fid);

      if (uErr) {
        return NextResponse.json(
          { error: "Failed to set OG", details: uErr },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
      }

      const { data: updatedRows, error: pErr } = await supabase
        .from("payments")
        .update({ status: "completed", frame_id: txHash, updated_at: new Date().toISOString() })
        .eq("fid", fid)
        .eq("kind", "og_rank")
        .eq("status", "pending")
        .select("id");

      if (pErr) console.warn("payments update (og_rank) error:", pErr);

      if (!updatedRows || updatedRows.length === 0) {
        const { error: insErr } = await supabase.from("payments").insert({
          fid,
          kind: "og_rank",
          pack_size: null,
          frame_id: txHash,
          status: "completed",
        });
        if (insErr) console.warn("payments insert (og_rank completed) error:", insErr);
      }

      return NextResponse.json(
        { ok: true, txHash },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { error: "Unsupported kind" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("Error in /api/pay/settle:", e);
    return NextResponse.json(
      { error: "Internal server error", details: String(e?.message ?? e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
