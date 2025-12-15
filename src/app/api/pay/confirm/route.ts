// src/app/api/pay/confirm/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = { fid: number; frameId: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;
    const frameId = body?.frameId;

    if (!fid || !Number.isFinite(fid) || !frameId) {
      return NextResponse.json({ error: "Missing fid or frameId" }, { status: 400 });
    }
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ error: "NEYNAR_API_KEY not set" }, { status: 500 });
    }

    // 1) payment record
    const { data: payment, error: payError } = await supabase
      .from("payments")
      .select("*")
      .eq("frame_id", frameId)
      .eq("fid", fid)
      .maybeSingle();

    if (payError) return NextResponse.json({ error: "DB error" }, { status: 500 });
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    if (payment.status === "completed") return NextResponse.json({ status: "already_completed" });

    // 2) Neynar status
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/frame/transaction/pay?id=${encodeURIComponent(frameId)}`,
      {
        method: "GET",
        headers: { accept: "application/json", "x-api-key": NEYNAR_API_KEY },
      }
    );

    const rawText = await res.text().catch(() => "");
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = rawText;
    }

    if (!res.ok) {
      console.error("Neynar GET pay error:", res.status, data);
      return NextResponse.json(
        { error: "Failed to fetch transaction status", neynarStatus: res.status, neynarBody: data },
        { status: 500 }
      );
    }

    const frame = data?.transaction_frame ?? data;
    const status = String(frame?.status ?? "").toLowerCase();

    if (!["completed", "succeeded", "confirmed"].includes(status)) {
      return NextResponse.json({ status: "pending" });
    }

    // 3) metadata
    const md = frame?.metadata || frame?.transaction?.metadata || data?.metadata || {};
    const kind: string | undefined = md.kind ?? payment.kind;
    const packSize: number | undefined = md.pack_size ?? payment.pack_size;

    // 4) credit
    if (kind === "extra_picks") {
      const inc = Number(packSize ?? 0);
      if (inc > 0) {
        // ensure stats row exists
        const { data: statsRow } = await supabase
          .from("user_stats")
          .select("fid, extra_picks_remaining")
          .eq("fid", fid)
          .maybeSingle();

        if (!statsRow) {
          // minimál insert (ha nálad több NOT NULL oszlop van, akkor ezt igazítsd!)
          await supabase.from("user_stats").insert({
            fid,
            extra_picks_remaining: inc,
            free_picks_remaining: 0,
            total_points: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } else {
          const current = Number(statsRow.extra_picks_remaining ?? 0);
          await supabase
            .from("user_stats")
            .update({
              extra_picks_remaining: current + inc,
              updated_at: new Date().toISOString(),
            })
            .eq("fid", fid);
        }
      }
    } else if (kind === "og_rank") {
      await supabase
        .from("users")
        .update({ is_og: true, updated_at: new Date().toISOString() })
        .eq("fid", fid);
    }

    // 5) mark payment completed
    await supabase
      .from("payments")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", payment.id);

    return NextResponse.json({ status: "completed" });
  } catch (error) {
    console.error("Error in /api/pay/confirm:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
