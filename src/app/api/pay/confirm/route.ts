// src/app/api/pay/confirm/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Body = {
  fid: number;
  frameId: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { fid, frameId } = body;

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

    // 1) Megkeressük a payment rekordot
    const { data: payment, error: payError } = await supabase
      .from("payments")
      .select("*")
      .eq("frame_id", frameId)
      .eq("fid", fid)
      .maybeSingle();

    if (payError) {
      console.error("Supabase payments fetch error:", payError);
      return NextResponse.json(
        { error: "DB error" },
        { status: 500 }
      );
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

    // 2) Lekérdezzük a Neynar-tól a tranzakciót
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

    // A pontos struktúra függ a Neynar API-tól, ezért óvatosan:
    const frame = data.transaction_frame ?? data;
    const status = (frame.status as string | undefined)?.toLowerCase();

    // Ha még nincs kész
    if (
      !status ||
      !["completed", "succeeded", "confirmed"].includes(status)
    ) {
      return NextResponse.json({ status: "pending" });
    }

    // Ha ide eljutunk, sikeresnek tekintjük a fizetést

    // Metadata visszaolvasása
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

    // 3) Supabase jóváírás
    if (kind === "extra_picks") {
      const increment = packSize ?? 0;
      if (increment > 0) {
        // Stats sor beolvasása
        const { data: statsRow, error: statsErr } = await supabase
          .from("stats")
          .select("extra_picks_remaining")
          .eq("fid", fid)
          .maybeSingle();

        if (statsErr) {
          console.error("Stats fetch error:", statsErr);
        } else if (statsRow) {
          const current = statsRow.extra_picks_remaining ?? 0;
          const { error: updateErr } = await supabase
            .from("stats")
            .update({
              extra_picks_remaining: current + increment,
              updated_at: new Date().toISOString(),
            })
            .eq("fid", fid);

          if (updateErr) {
            console.error("Stats update error:", updateErr);
          } else {
            console.log(
              `Added ${increment} extra picks to fid ${fid}`
            );
          }
        } else {
          console.warn(
            "No stats row for fid in confirm, consider creating it earlier"
          );
        }
      }
    } else if (kind === "og_rank") {
      const { error: updateErr } = await supabase
        .from("users")
        .update({
          is_og: true,
          updated_at: new Date().toISOString(),
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

    // 4) Payments státusz frissítés
    const { error: statusErr } = await supabase
      .from("payments")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
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
