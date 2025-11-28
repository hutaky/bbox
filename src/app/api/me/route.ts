import { NextResponse } from "next/server";
import { ensureUser, getUserState } from "@/lib/user";

function getFidFromRequest(req: Request): number | null {
  const header = req.headers.get("x-bbox-fid");
  if (!header) return null;
  const fid = Number(header);
  return Number.isFinite(fid) ? fid : null;
}

export async function GET(req: Request) {
  const fid = getFidFromRequest(req);
  if (!fid) {
    return NextResponse.json({ error: "Missing FID (x-bbox-fid header)" }, { status: 401 });
  }

  await ensureUser(fid);

  const { user, stats } = await getUserState(fid);

  return NextResponse.json({
    fid,
    username: user.username,
    isOg: user.is_og,
    totalPoints: stats.total_points,
    freePicksRemaining: stats.free_picks_remaining,
    extraPicksBalance: stats.extra_picks_balance,
    nextFreeRefillAt: stats.next_free_refill_at
  });
}