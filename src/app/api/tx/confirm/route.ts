// src/app/api/tx/confirm/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RECEIVER_ADDRESS = process.env.NEYNAR_PAY_RECEIVER_ADDRESS!;
const USDC_CONTRACT = process.env.NEYNAR_USDC_CONTRACT!;
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org"; // lehet env-be is tenni

const PRICE_1 = String(process.env.BBOX_EXTRA_PRICE_1 || "0.5");
const PRICE_5 = String(process.env.BBOX_EXTRA_PRICE_5 || "2.0");
const PRICE_10 = String(process.env.BBOX_EXTRA_PRICE_10 || "3.5");
const OG_PRICE = String(process.env.BBOX_OG_PRICE || "5.0");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body =
  | { fid: number; kind: "extra_picks"; packSize: 1 | 5 | 10; txHash: string }
  | { fid: number; kind: "og_rank"; txHash: string };

function isHexAddress(s: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}
function isTxHash(s: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(s);
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

async function rpc(method: string, params: any[]) {
  const res = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) {
    throw new Error(j?.error?.message || `RPC error calling ${method}`);
  }
  return j.result;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = (body as any)?.fid as number | undefined;
    const kind = (body as any)?.kind as string | undefined;
    const txHash = (body as any)?.txHash as string | undefined;

    if (!fid || !Number.isFinite(fid) || !kind || !txHash) {
      return NextResponse.json({ error: "Missing fid/kind/txHash" }, { status: 400 });
    }
    if (!isTxHash(txHash)) {
      return NextResponse.json({ error: "Invalid txHash" }, { status: 400 });
    }
    if (!RECEIVER_ADDRESS || !USDC_CONTRACT || !isHexAddress(RECEIVER_ADDRESS) || !isHexAddress(USDC_CONTRACT)) {
      return NextResponse.json({ error: "Server misconfigured (receiver/usdc)" }, { status: 500 });
    }

    // Fetch tx + receipt
    const tx = await rpc("eth_getTransactionByHash", [txHash]);
    if (!tx) {
      return NextResponse.json({ status: "not_found" }, { status: 200 });
    }

    // tx must be to USDC
    const to = (tx.to as string | null) ?? null;
    if (!to || to.toLowerCase() !== USDC_CONTRACT.toLowerCase()) {
      return NextResponse.json(
        { status: "invalid", reason: "tx.to != USDC_CONTRACT", to },
        { status: 200 }
      );
    }

    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (!receipt) {
      return NextResponse.json({ status: "pending" }, { status: 200 });
    }

    // status: "0x1" success, "0x0" fail
    if (receipt.status !== "0x1") {
      return NextResponse.json({ status: "failed" }, { status: 200 });
    }

    // Validate input matches expected transfer(receiver, amount)
    let expectedAmountStr: string;
    let expectedAmountUnits: bigint;

    if (kind === "extra_picks") {
      const packSize = (body as any).packSize as 1 | 5 | 10 | undefined;
      if (!packSize) return NextResponse.json({ error: "Missing packSize" }, { status: 400 });

      expectedAmountStr = packSize === 1 ? PRICE_1 : packSize === 5 ? PRICE_5 : PRICE_10;
      expectedAmountUnits = parseUsdcAmountToUnits(expectedAmountStr);

      const expectedData = encodeErc20Transfer(RECEIVER_ADDRESS, expectedAmountUnits).toLowerCase();
      const gotData = String(tx.input || "").toLowerCase();

      if (gotData !== expectedData) {
        return NextResponse.json(
          {
            status: "invalid",
            reason: "tx.input mismatch",
            expectedAmount: expectedAmountStr,
          },
          { status: 200 }
        );
      }

      // Apply reward: increment extra_picks_remaining
      const { data: statsRow, error: statsErr } = await supabase
        .from("user_stats")
        .select("fid, extra_picks_remaining")
        .eq("fid", fid)
        .maybeSingle();

      if (statsErr) {
        console.error("stats select error:", statsErr);
        return NextResponse.json({ error: "DB error" }, { status: 500 });
      }

      const currentExtra = Number(statsRow?.extra_picks_remaining ?? 0);
      const newExtra = currentExtra + packSize;

      const { error: updErr } = await supabase
        .from("user_stats")
        .update({ extra_picks_remaining: newExtra, updated_at: new Date().toISOString() })
        .eq("fid", fid);

      if (updErr) {
        console.error("stats update error:", updErr);
        return NextResponse.json({ error: "Failed to update user_stats" }, { status: 500 });
      }

      // Mark payment completed (best effort)
      await supabase
        .from("payments")
        .update({ status: "completed", frame_id: txHash, updated_at: new Date().toISOString() })
        .eq("fid", fid)
        .eq("kind", "extra_picks");

      return NextResponse.json({ status: "completed" }, { status: 200 });
    }

    if (kind === "og_rank") {
      expectedAmountStr = OG_PRICE;
      expectedAmountUnits = parseUsdcAmountToUnits(expectedAmountStr);

      const expectedData = encodeErc20Transfer(RECEIVER_ADDRESS, expectedAmountUnits).toLowerCase();
      const gotData = String(tx.input || "").toLowerCase();

      if (gotData !== expectedData) {
        return NextResponse.json(
          { status: "invalid", reason: "tx.input mismatch", expectedAmount: expectedAmountStr },
          { status: 200 }
        );
      }

      // Apply OG: users.is_og = true
      const { error: userUpdErr } = await supabase
        .from("users")
        .upsert({ fid, is_og: true }, { onConflict: "fid" });

      if (userUpdErr) {
        console.error("users upsert error:", userUpdErr);
        return NextResponse.json({ error: "Failed to set OG" }, { status: 500 });
      }

      await supabase
        .from("payments")
        .update({ status: "completed", frame_id: txHash, updated_at: new Date().toISOString() })
        .eq("fid", fid)
        .eq("kind", "og_rank");

      return NextResponse.json({ status: "completed" }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  } catch (e: any) {
    console.error("Error in /api/tx/confirm:", e);
    return NextResponse.json(
      { error: "Internal server error", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
