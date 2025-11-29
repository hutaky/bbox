"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import sdk from "@farcaster/frame-sdk";

type LeaderboardRow = {
  fid: number;
  username: string | null;
  total_points: number;
  common_count: number;
  rare_count: number;
  epic_count: number;
  legendary_count: number;
};

type MyRankRow = {
  fid: number;
  username: string | null;
  rank: number | null;
  total_points: number;
  common_count: number;
  rare_count: number;
  epic_count: number;
  legendary_count: number;
};

function getFidFromQuery(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const f = params.get("fid");
  if (!f) return null;
  const n = Number(f);
  return Number.isFinite(n) ? n : null;
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewerName, setViewerName] = useState<string | null>(null);
  const [viewerPfp, setViewerPfp] = useState<string | null>(null);
  const [fid, setFid] = useState<number | null>(null);

  const [myRank, setMyRank] = useState<MyRankRow | null>(null);
  const [myRankError, setMyRankError] = useState<string | null>(null);

  // HEADER – ugyanaz a logika, mint a főoldalon (sdk.context + ?fid fallback)
  useEffect(() => {
    async function initHeader() {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("sdk.actions.ready() failed (Leaderboard):", e);
      }

      try {
        const ctx: any = await sdk.context;

        const ctxFid =
          ctx?.user?.fid ??
          ctx?.viewer?.fid ??
          ctx?.viewerContext?.user?.fid ??
          null;

        const queryFid = getFidFromQuery();
        const finalFid = ctxFid || queryFid || null;
        if (finalFid) setFid(finalFid);

        const uname =
          ctx?.user?.username ??
          ctx?.viewer?.username ??
          ctx?.viewerContext?.user?.username ??
          null;

        const pfp =
          ctx?.user?.pfpUrl ??
          ctx?.user?.pfp_url ??
          ctx?.viewer?.pfpUrl ??
          ctx?.viewer?.pfp_url ??
          ctx?.viewerContext?.user?.pfpUrl ??
          ctx?.viewerContext?.user?.pfp_url ??
          null;

        if (uname && typeof uname === "string") {
          setViewerName(uname);
        } else {
          setViewerName("BBOX player");
        }

        if (pfp && typeof pfp === "string") {
          setViewerPfp(pfp);
        }
      } catch (e) {
        console.warn("sdk.context read failed on Leaderboard:", e);
        setViewerName((prev) => prev || "BBOX player");

        // ha nincs sdk.context, legalább a query ?fid-et próbáljuk
        if (!fid) {
          const q = getFidFromQuery();
          if (q) setFid(q);
        }
      }
    }

    if (typeof window !== "undefined") {
      void initHeader();
    }
  }, []);

  const displayName = viewerName || "BBOX player";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  // LEADERBOARD adatok – mindig friss (no-store)
  useEffect(() => {
    async function loadLeaderboard() {
      try {
        const res = await fetch("/api/leaderboard", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load leaderboard");
        } else {
          setRows(data);
        }
      } catch (e: any) {
        console.error(e);
        setError("Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    }
    loadLeaderboard();
  }, []);

  // SAJÁT RANK – külön API /api/my-rank
  useEffect(() => {
    if (!fid) return;

    async function loadMyRank() {
      try {
        const res = await fetch("/api/my-rank", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fid }),
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          setMyRankError(data.error || "Failed to load your rank");
        } else {
          setMyRank(data);
        }
      } catch (e) {
        console.error("my-rank fetch error:", e);
        setMyRankError("Failed to load your rank");
      }
    }

    loadMyRank();
  }, [fid]);

  // ---- LOADING SCREEN ----
  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white p-4 flex flex-col items-center">
        <div className="w-full max-w-md space-y-4">
          {/* HEADER – mint a főoldalon */}
          <header className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <img
                src="/icon.png"
                alt="BBOX logo"
                className="w-8 h-8 rounded-lg border border-baseBlue/40"
              />
              <div>
                <h1 className="text-xl font-semibold tracking-tight">BBOX</h1>
                <p className="text-[11px] text-gray-400">
                  Daily Based Box game
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {viewerPfp ? (
                <img
                  src={viewerPfp}
                  alt={displayName}
                  className="w-9 h-9 rounded-full border border-baseBlue/40 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-baseBlue/40 flex items-center justify-center text-sm font-semibold">
                  {avatarInitial}
                </div>
              )}
              <div className="text-right">
                <div className="text-sm font-medium truncate">
                  {displayName}
                </div>
                {fid && (
                  <div className="text-[11px] text-gray-500">
                    FID #{fid}
                  </div>
                )}
              </div>
            </div>
          </header>

          <p className="text-sm text-gray-400 text-center mt-4">
            Loading leaderboard…
          </p>
        </div>
      </main>
    );
  }

  // ---- ERROR SCREEN ----
  if (error) {
    return (
      <main className="min-h-screen bg-black text-white p-4 flex flex-col items-center">
        <div className="w-full max-w-md space-y-4">
          {/* HEADER */}
          <header className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <img
                src="/icon.png"
                alt="BBOX logo"
                className="w-8 h-8 rounded-lg border border-baseBlue/40"
              />
              <div>
                <h1 className="text-xl font-semibold tracking-tight">BBOX</h1>
                <p className="text-[11px] text-gray-400">
                  Daily Based Box game
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {viewerPfp ? (
                <img
                  src={viewerPfp}
                  alt={displayName}
                  className="w-9 h-9 rounded-full border border-baseBlue/40 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-baseBlue/40 flex items-center justify-center text-sm font-semibold">
                  {avatarInitial}
                </div>
              )}
              <div className="text-right">
                <div className="text-sm font-medium truncate">
                  {displayName}
                </div>
                {fid && (
                  <div className="text-[11px] text-gray-500">
                    FID #{fid}
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Page top bar */}
          <div className="flex items-center justify-between mt-2">
            <Link
              href="/"
              className="text-xs text-gray-300 hover:text-white inline-flex items-center gap-1"
            >
              <span>←</span>
              <span>Back</span>
            </Link>
            <span className="text-sm font-semibold text-gray-200">
              BBOX Leaderboard
            </span>
          </div>

          <p className="text-sm text-red-400 mt-2">{error}</p>
        </div>
      </main>
    );
  }

  // ---- NORMAL RENDER ----
  return (
    <main className="min-h-screen bg-black text-white p-4 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        {/* HEADER – ugyanaz, mint a főoldalon */}
        <header className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <img
              src="/icon.png"
              alt="BBOX logo"
              className="w-8 h-8 rounded-lg border border-baseBlue/40"
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">BBOX</h1>
              <p className="text-[11px] text-gray-400">
                Daily Based Box game
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {viewerPfp ? (
              <img
                src={viewerPfp}
                alt={displayName}
                className="w-9 h-9 rounded-full border border-baseBlue/40 object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-baseBlue/40 flex items-center justify-center text-sm font-semibold">
                {avatarInitial}
              </div>
            )}
            <div className="text-right">
              <div className="text-sm font-medium truncate">
                {displayName}
              </div>
              {fid && (
                <div className="text-[11px] text-gray-500">FID #{fid}</div>
              )}
            </div>
          </div>
        </header>

        {/* Page top bar */}
        <div className="flex items-center justify-between mt-2">
          <Link
            href="/"
            className="text-xs text-gray-300 hover:text-white inline-flex items-center gap-1"
          >
            <span>←</span>
            <span>Back</span>
          </Link>
          <span className="text-sm font-semibold text-gray-200">
            BBOX Leaderboard
          </span>
        </div>

        {/* YOUR RANK BOX */}
        <section className="mt-2 mb-1 rounded-2xl border border-baseBlue/50 bg-baseBlue/10 px-4 py-3">
          <p className="text-xs text-gray-300 mb-1">
            Your rank is:
          </p>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-baseBlue">
                {myRank?.rank ?? "—"}
              </span>
              <span className="text-xs text-gray-400">/ all players</span>
            </div>
            <span className="text-xs text-gray-300">
              {myRank?.total_points ?? 0} pts
            </span>
          </div>
          <p className="mt-2 text-[11px] text-gray-300">
            C {myRank?.common_count ?? 0} · R {myRank?.rare_count ?? 0} · E{" "}
            {myRank?.epic_count ?? 0} · L {myRank?.legendary_count ?? 0}
          </p>
          {myRankError && (
            <p className="mt-1 text-[10px] text-red-400">{myRankError}</p>
          )}
        </section>

        {/* LEADERBOARD LIST */}
        <div className="space-y-3 mt-1">
          {rows.map((r, index) => (
            <div
              key={r.fid}
              className="rounded-xl border border-gray-800 bg-gray-950/80 p-4 space-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold text-baseBlue">
                    #{index + 1}
                  </span>
                  <span className="font-medium">
                    {r.username || `fid:${r.fid}`}
                  </span>
                </div>
                <span className="text-baseBlue font-semibold">
                  {r.total_points ?? 0} pts
                </span>
              </div>

              <div className="text-xs text-gray-400">
                C {r.common_count ?? 0} · R {r.rare_count ?? 0} · E{" "}
                {r.epic_count ?? 0} · L {r.legendary_count ?? 0}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
