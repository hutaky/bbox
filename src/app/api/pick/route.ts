import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { ensureUser, refreshFreePicksIfNeeded } from "@/lib/user";
import { rollRarity, rollPoints } from "@/lib/gameLogic";

function getFidFromRequest(req: Request): number | null {
  const header = req.headers.get("x-bbox-fid");
  if (header) {
    const fidFromHeader = Number(header);
    if (Number.isFinite(fidFromHeader)) return fidFromHeader;
  }

  try {
    const url = new URL(req.url);
    const fidParam = url.searchParams.get("fid");
    if (!fidParam) return null;
    const fid = Number(fidParam);
    return Number.isFinite(fid) ? fid : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const fid = getFidFromRequest(req);
  if (!fid) {
    return NextResponse.json(
      { error: "Missing FID (x-bbox-fid header or ?fid= param)" },
      { status: 401 }
    );
  }

  await ensureUser(fid);
  let { user, stats } = await refreshFreePicksIfNeeded(fid);

  let pickType: "free" | "extra" | null = null;

  if (stats.free_picks_remaining > 0) {
    pickType = "free";
  } else if (stats.extra_picks_balance > 0) {
    pickType = "extra";
  } else {
    const now = new Date();
    let next = stats.next_free_refill_at;
    if (!next) {
      next = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      await supabaseServer
        .from("user_stats")
        .update({ next_free_refill_at: next })
        .eq("fid", fid);
    }
    return NextResponse.json(
      {
        error: "No picks left",
        nextFreeRefillAt: next
      },
      { status: 400 }
    );
  }

  const rarity = rollRarity();
  const points = rollPoints(rarity);
  const now = new Date();

  const update: any = {
    total_points: stats.total_points + points,
    updated_at: now.toISOString()
  };

  if (pickType === "free") {
    update.free_picks_remaining = stats.free_picks_remaining - 1;
  } else {
    update.extra_picks_balance = stats.extra_picks_balance - 1;
  }

  if (
    (pickType === "free" &&
      update.free_picks_remaining === 0 &&
      stats.extra_picks_balance === 0) ||
    (pickType === "extra" &&
      stats.free_picks_remaining === 0 &&
      update.extra_picks_balance === 0)
  ) {
    update.next_free_refill_at = new Date(
      now.getTime() + 24 * 60 * 60 * 1000
    ).toISOString();
  }

  const { data: updatedStats } = await supabaseServer
    .from("user_stats")
    .update(update)
    .eq("fid", fid)
    .select("*")
    .single();

  await supabaseServer.from("picks").insert({
    fid,
    points,
    rarity,
    pick_type: pickType,
    created_at: now.toISOString()
  });

  return NextResponse.json({
    rarity,
    points,
    totalPoints: updatedStats.total_points,
    freePicksRemaining: updatedStats.free_picks_remaining,
    extraPicksBalance: updatedStats.extra_picks_balance,
    nextFreeRefillAt: updatedStats.next_free_refill_at
  });
}
