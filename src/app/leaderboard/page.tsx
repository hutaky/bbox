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

        setViewerName(uname || "BBOX player");
        if (pfp && typeof pfp === "string") setViewerPfp(pfp);
      } catch (e) {
        console.warn("sdk.context read failed on Leaderboard:", e);
        setViewerName((prev) => prev || "BBOX player");

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

  // ---- közös HEADER komponens ----
  function renderHeader() {
    return (
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <img
            src="/icon.png"
            alt="BBOX logo"
            className="w-9 h-9 rounded-xl border border-[#23A9F2]/50 shadow-[0_0_18px_rgba(35,169,242,0.45)]"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">BBOX</h1>
              <span className="px-2 py-[2px] rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-400/60 text-emerald-200">
                Season 0
              </span>
            </div>
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]" />
              Daily Based Box game
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {viewerPfp ? (
            <img
              src={viewerPfp}
              alt={displayName}
              className="w-9 h-9 rounded-full border border-[#23A9F2]/60 object-cover shadow-[0_0_12px_rgba(35,169,242,0.65)]"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-900 border border-[#23A9F2]/60 flex items-center justify-center text-sm font-semibold">
              {avatarInitial}
            </div>
          )}
          <div className="text-right">
            <div className="text-sm font-medium truncate">{displayName}</div>
            {fid && (
              <div className="text-[11px] text-gray-500">FID #{fid}</div>
            )}
          </div>
        </div>
      </header>
    );
  }

  // ---- LOADING / ERROR ----
  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white p-4 flex flex-col items-center">
        <div className="w-full max-w-md space-y-4">
          {renderHeader()}
          <p className="text-sm text-gray-400 text-center mt-4">
            Loading leaderboard…
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-black text-white p-4 flex flex-col items-center">
        <div className="w-full max-w-md space-y-4">
          {renderHeader()}

          <div className="flex items-center justify-between mt-1">
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

          <p className="text-sm text-red-400 mt-3">{error}</p>
        </div>
      </main>
    );
  }

  // ---- NORMAL RENDER ----
  return (
    <main className="min-h-screen bg-black text-white p-4 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        {renderHeader()}

        {/* top bar */}
        <div className="flex items-center justify-between mt-1">
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

        {/* YOUR RANK CARD – neon kártya */}
        <section className="mt-3 rounded-3xl border border-[#1F6DF2]/60 bg-gradient-to-br from-[#0B1020] via-[#050816] to-black px-4 py-3 shadow-[0_0_40px_rgba(31,109,242,0.45)]">
          <p className="text-[11px] text-gray-300 mb-1">
            Your rank is:
          </p>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-[#23A9F2] leading-none">
                {myRank?.rank ?? "—"}
              </span>
              <span className="text-[11px] text-gray-400">/ all players</span>
            </div>
            <span className="text-xs text-gray-200">
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

        {/* LISTA */}
        <div className="space-y-3 mt-2">
          {rows.map((r, index) => {
            const isMe = fid && r.fid === fid;
            const label = r.username || `fid_${r.fid}`;
            const rarityLine = `C ${r.common_count ?? 0} · R ${
              r.rare_count ?? 0
            } · E ${r.epic_count ?? 0} · L ${r.legendary_count ?? 0}`;

            return (
              <div
                key={r.fid}
                className={`rounded-3xl px-4 py-3 border transition ${
                  isMe
                    ? "border-[#23A9F2] bg-gradient-to-r from-[#071125] via-[#020617] to-black shadow-[0_0_30px_rgba(35,169,242,0.5)]"
                    : "border-slate-800 bg-gradient-to-r from-[#020617] via-[#020617] to-black"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold ${
                        index === 0
                          ? "bg-[#23A9F2]/20 text-[#23A9F2] border border-[#23A9F2]/70"
                          : "bg-slate-800/60 text-slate-200"
                      }`}
                    >
                      #{index + 1}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">
                        {label}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {rarityLine}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#1F6DF2]">
                    {r.total_points ?? 0} pts
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
