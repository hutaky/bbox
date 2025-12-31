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

// 10 perc után a “pending” purchase-t tekintsük megszakadtnak,
// hogy a user tudjon újra próbálkozni.
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
  | { fid: number; kind: "extra_picks"; packSize: 1 | 5 | 10; txHash: `0x${string}` }
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

    const fid = (body as any)?.fid as number | undefined;
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

    // --- 0) Idempotencia: ha már volt ilyen txHash feldolgozva, ne krediteljünk újra ---
    // (frame_id mezőben tároljuk a txHash-t)
    {
      const { data: already, error: aErr } = await supabase
        .from("payments")
        .select("id, status")
        .eq("frame_id", txHash)
        .maybeSingle();

      // ha a select hibázik, nem állunk meg, csak logoljuk
      if (aErr) console.warn("payments idempotency check error:", aErr);

      if (already?.status === "completed") {
        return NextResponse.json({ ok: true, txHash, alreadyProcessed: true });
      }
    }

    // --- 1) Pending “beragadás” kezelése: régi pending sorok lezárása ---
    // (hogy új vásárlást tudjon indítani)
    // NOTE: Ha nálad nincs 'cancelled' status, cseréld 'failed'-re.
    try {
      const cutoff = isoMinutesAgo(PENDING_TTL_MINUTES);

      // extra_picks pendingek (minden pack)
      await supabase
        .from("payments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("fid", fid)
        .eq("status", "pending")
        .lt("created_at", cutoff);

      // (opcionális) csak az adott kind-et is lehetne szűrni,
      // de így minden régi pendinget takarítunk.
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
        {
          error: "Wrong amount",
          details: { expected: exp.toString(), actual: amount.toString(), kind, packSize },
        },
        { status: 400 }
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
        { status: 400 }
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
        return NextResponse.json({ error: "User stats missing" }, { status: 500 });
      }

      const current = Number(stats.extra_picks_remaining ?? 0);
      const next = current + add;

      const { error: uErr } = await supabase
        .from("user_stats")
        .update({ extra_picks_remaining: next, updated_at: new Date().toISOString() })
        .eq("fid", fid);

      if (uErr) return NextResponse.json({ error: "Failed to credit picks", details: uErr }, { status: 500 });

      // először próbáljuk a megfelelő pending sort completed-re állítani
      const { data: updatedRows, error: pErr } = await supabase
        .from("payments")
        .update({ status: "completed", frame_id: txHash, updated_at: new Date().toISOString() })
        .eq("fid", fid)
        .eq("kind", "extra_picks")
        .eq("pack_size", packSize ?? null)
        .eq("status", "pending")
        .select("id");

      if (pErr) console.warn("payments update (extra_picks) error:", pErr);

      // ha nem volt pending sor (pl. régi cleanup miatt), tegyünk be egy completed rekordot,
      // hogy később auditálható legyen
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

      return NextResponse.json({ ok: true, credited: add, txHash });
    }

    if (kind === "og_rank") {
      const { error: uErr } = await supabase
        .from("users")
        .update({ is_og: true, updated_at: new Date().toISOString() })
        .eq("fid", fid);

      if (uErr) return NextResponse.json({ error: "Failed to set OG", details: uErr }, { status: 500 });

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
