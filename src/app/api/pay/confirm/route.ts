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

type Body = {
  fid: number;
  frameId: string;
};

function isSuccessStatus(status?: string | null) {
  const s = (status || "").toLowerCase();
  return ["completed", "succeeded", "confirmed"].includes(s);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const fid = body?.fid;
    const frameId = body?.frameId;

    if (!fid || !frameId) {
      return NextResponse.json(
        { error: "Missing fid or frameId" },
        { status: 400 }
      );
    }
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ error: "NEYNAR_API_KEY not set" }, { status: 500 });
    }

    // 1) Payment rekord (Supabase) – opcionális, de hasznos
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("*")
      .eq("frame_id", frameId)
      .eq("fid", fid)
      .maybeSingle();

    if (payErr) {
      console.error("payments select error:", payErr);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }
    if (!payment) {
      return NextResponse.json(
        { error: "Payment not found for this frameId/fid" },
        { status: 404 }
      );
    }
    if (payment.status === "completed") {
      return NextResponse.json({ status: "already_completed" });
    }

    // 2) Neynar pay státusz
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/frame/transaction/pay?id=${encodeURIComponent(frameId)}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": NEYNAR_API_KEY,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Neynar GET pay error:", res.status, text);
      return NextResponse.json(
        { error: "Failed to fetch transaction status" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const frame = data?.transaction_frame ?? data;
    const status = frame?.status as string | undefined;

    if (!isSuccessStatus(status)) {
      return NextResponse.json({ status: "pending" });
    }

    // 3) Metadata: mit vett?
    const md =
      frame?.metadata ||
      frame?.transaction?.metadata ||
      data?.metadata ||
      {};

    const kind: string | undefined = md.kind ?? payment.kind;
    const packSize: number | undefined = md.pack_size ?? payment.pack_size;

    // 4) Jóváírás DB-ben
    const nowIso = new Date().toISOString();

    if (kind === "extra_picks") {
      const inc = Number(packSize || 0);

      if (inc > 0) {
        // user_stats extra_picks_remaining += inc
        const { data: stats, error: statsErr } = await supabase
          .from("user_stats")
          .select("extra_picks_remaining")
          .eq("fid", fid)
          .maybeSingle();

        if (statsErr) {
          console.error("user_stats select error:", statsErr);
          return NextResponse.json({ error: "DB error" }, { status: 500 });
        }
        if (!stats) {
          return NextResponse.json(
            { error: "No user_stats row for this fid" },
            { status: 404 }
          );
        }

        const current = Number(stats.extra_picks_remaining || 0);
        const { error: updErr } = await supabase
          .from("user_stats")
          .update({
            extra_picks_remaining: current + inc,
            updated_at: nowIso,
          })
          .eq("fid", fid);

        if (updErr) {
          console.error("user_stats update error:", updErr);
          return NextResponse.json({ error: "Failed to credit picks" }, { status: 500 });
        }
      }
    } else if (kind === "og_rank") {
      const { error: updErr } = await supabase
        .from("users")
        .update({ is_og: true, updated_at: nowIso })
        .eq("fid", fid);

      if (updErr) {
        console.error("users is_og update error:", updErr);
        return NextResponse.json({ error: "Failed to set OG" }, { status: 500 });
      }
    } else {
      console.warn("Unknown payment kind:", kind);
    }

    // 5) payment rekord completed
    const { error: statusErr } = await supabase
      .from("payments")
      .update({ status: "completed", updated_at: nowIso })
      .eq("id", payment.id);

    if (statusErr) {
      console.error("payments status update error:", statusErr);
      // nem bukjuk el, a jóváírás megvolt
    }

    return NextResponse.json({ status: "completed" });
  } catch (e) {
    console.error("Error in /api/pay/confirm:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
