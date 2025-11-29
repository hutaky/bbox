// src/app/api/webhook/neynar/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NEYNAR_WEBHOOK_SECRET = process.env.NEYNAR_WEBHOOK_SECRET!;

export const runtime = "nodejs";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Ellenőrzi a Neynar webhook HMAC aláírást.
 * Neynar docs: "Verify Webhooks with HMAC Signatures"
 */
function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!NEYNAR_WEBHOOK_SECRET || !signature) return false;

  const hmac = crypto.createHmac("sha256", NEYNAR_WEBHOOK_SECRET);
  hmac.update(rawBody, "utf8");
  const digest = hmac.digest("hex");

  // Neynar tipikusan "sha256=..." formát használhat – biztonság kedvéért kezeljük mindkettőt
  const cleanSig = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;

  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(cleanSig)
  );
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get("x-neynar-signature");

    if (!verifySignature(rawBody, sig)) {
      console.error("Invalid Neynar webhook signature");
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    console.log("Neynar webhook payload:", JSON.stringify(payload));

    // A pontos mezőnevek Neynar dashboard beállításaitól függnek.
    // A tipikus struktúra (példa):
    //
    // {
    //   "type": "transaction.pay.completed",
    //   "data": {
    //     "frame_id": "...",
    //     "tx_hash": "...",
    //     "payer": { "fid": 511849, ... },
    //     "metadata": {
    //       "kind": "extra_picks",
    //       "fid": 511849,
    //       "pack_size": 5
    //     }
    //   }
    // }

    const eventType: string | undefined = payload.type;
    const data = payload.data || {};
    const metadata = data.metadata || {};
    const fidFromMetadata = metadata.fid as number | undefined;
    const packSize = metadata.pack_size as number | undefined;
    const kind = metadata.kind as string | undefined;

    const payerFid =
      fidFromMetadata ??
      (data.payer?.fid as number | undefined) ??
      undefined;

    if (eventType !== "transaction.pay.completed") {
      // Más webhook eventekre most nem reagálunk
      return NextResponse.json({ ok: true });
    }

    if (!payerFid) {
      console.error("No fid in webhook payload");
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!kind) {
      console.error("No metadata.kind in webhook payload");
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (kind === "extra_picks") {
      const increment = packSize ?? 0;

      if (increment <= 0) {
        console.error("Invalid pack_size for extra_picks:", packSize);
      } else {
        // Feltételezzük, hogy a stats tábla így néz ki: { fid, extra_picks_remaining, ... }
        const { data: existing, error: fetchError } = await supabase
          .from("stats")
          .select("extra_picks_remaining")
          .eq("fid", payerFid)
          .maybeSingle();

        if (fetchError) {
          console.error("Supabase fetch stats error:", fetchError);
        } else if (existing) {
          const current = existing.extra_picks_remaining ?? 0;
          const { error: updateError } = await supabase
            .from("stats")
            .update({
              extra_picks_remaining: current + increment,
            })
            .eq("fid", payerFid);

          if (updateError) {
            console.error("Supabase update stats error:", updateError);
          } else {
            console.log(
              `Added ${increment} extra picks to fid ${payerFid}`
            );
          }
        } else {
          console.error(
            "stats row not found for fid in webhook, consider creating it lazily"
          );
        }
      }
    } else if (kind === "og_rank") {
      // Feltételezzük, hogy a users tábla: { fid, is_og, ... }
      const { error: updateError } = await supabase
        .from("users")
        .update({ is_og: true })
        .eq("fid", payerFid);

      if (updateError) {
        console.error("Supabase update users(is_og) error:", updateError);
      } else {
        console.log(`Set is_og = true for fid ${payerFid}`);
      }
    } else {
      console.log("Unhandled metadata.kind:", kind);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in Neynar webhook handler:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
