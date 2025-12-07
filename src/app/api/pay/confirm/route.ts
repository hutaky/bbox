// src/app/api/pay/confirm/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!;

// Ugyanaz a Supabase config, mint /api/pick-ben
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = {
  fid: number;
  frameId: string;
};

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
      return NextResponse.json(
        { error: "NEYNAR_API_KEY not set" },
        { status: 500 }
      );
    }

    // 1) Payment rekord keresése
    const { data: payment, error: payError } = await supabase
      .from("payments")
      .select("*")
      .eq("frame_id", frameId)
      .eq("fid", fid)
      .maybeSingle();

    if (payError) {
      console.error("Supabase payments fetch error:", payError);
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

    // 2) Neynar fizetés státusz lekérdezése
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/frame/transaction/pay?id=${encodeURIComponent(
        frameId
      )}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": NEYNAR_API_KEY,
        },
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
    console.log("Neynar pay status payload:", JSON.stringify(data));

    const frame = data.transaction_frame ?? data;
    const status = (frame.status as string | undefined)?.toLowerCase();

    if (
      !status ||
      !["completed", "succeeded", "confirmed"].includes(status)
    ) {
      // még nem végleges a fizetés
      return NextResponse.json({ status: "pending" });
    }

    // 3) Metadata, hogy mit vett a user
    const md =
      frame.metadata ||
      frame.transaction?.metadata ||
      data.metadata ||
      {};

    const kind: string | undefined = md.kind ?? payment.kind;
    const packSize: number | undefined = md.pack_size ?? payment.pack_size;
    const fidMeta: number | undefined = md.fid;

    if (fidMeta && fidMeta !== fid) {
      console.warn(
        "FID mismatch between metadata and request:",
        fidMeta,
        fid
      );
    }

    const nowIso = new Date().toISOString();

    // 4) Jóváírás Supabase-ben
    if (kind === "extra_picks") {
      const increment = packSize ?? 0;

      if (increment > 0) {
        const { data: statsRow, error: statsErr } = await supabase
          .from("user_stats")
          .select("extra_picks_remaining")
          .eq("fid", fid)
          .maybeSingle();

        if (statsErr) {
          console.error("user_stats fetch error:", statsErr);
        } else if (statsRow) {
          const current = statsRow.extra_picks_remaining ?? 0;

          const { error: updateErr } = await supabase
            .from("user_stats")
            .update({
              extra_picks_remaining: current + increment,
              updated_at: nowIso,
            })
            .eq("fid", fid);

          if (updateErr) {
            console.error("user_stats update error (extra picks):", updateErr);
          } else {
            console.log(
              `Added ${increment} extra picks to fid ${fid}`
            );
          }
        } else {
          console.warn(
            "No user_stats row for fid in confirm, consider ensuring creation in /api/me"
          );
        }
      }
    } else if (kind === "og_rank") {
      const { error: updateErr } = await supabase
        .from("users")
        .update({
          is_og: true,
          updated_at: nowIso,
        })
        .eq("fid", fid);

      if (updateErr) {
        console.error("User OG update error:", updateErr);
      } else {
        console.log(`Set is_og = true for fid ${fid}`);
      }
    } else {
      console.warn("Unknown payment kind in confirm:", kind);
    }

    // 5) Payment státusz frissítés
    const { error: statusErr } = await supabase
      .from("payments")
      .update({
        status: "completed",
        updated_at: nowIso,
      })
      .eq("id", payment.id);

    if (statusErr) {
      console.error("Payment status update error:", statusErr);
    }

    return NextResponse.json({ status: "completed" });
  } catch (error) {
    console.error("Error in /api/pay/confirm:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
