import { NextResponse } from "next/server";
import { ensureUser, refreshFreePicksIfNeeded } from "@/lib/user";

function getFidFromRequest(req: Request): number | null {
  // 1) headerből (MiniAppban így jön)
  const header = req.headers.get("x-bbox-fid");
  if (header) {
    const fidFromHeader = Number(header);
    if (Number.isFinite(fidFromHeader)) return fidFromHeader;
  }

  // 2) query paramból (böngészős teszt: /api/me?fid=123)
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

export async function GET(req: Request) {
  const fid = getFidFromRequest(req);
  if (!fid) {
    return NextResponse.json(
      { error: "Missing FID (x-bbox-fid header or ?fid= param)" },
      { status: 401 }
    );
  }

  try {
    await ensureUser(fid);
    const { user, stats } = await refreshFreePicksIfNeeded(fid);

    return NextResponse.json({
      fid,
      username: user.username,
      isOg: user.is_og,
      totalPoints: stats.total_points,
      freePicksRemaining: stats.free_picks_remaining,
      extraPicksBalance: stats.extra_picks_balance,
      nextFreeRefillAt: stats.next_free_refill_at
    });
  } catch (e: any) {
    console.error("BBOX /api/me error for fid", fid, e);
    return NextResponse.json(
      { error: "Internal error in /api/me", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
