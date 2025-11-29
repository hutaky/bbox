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

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewerName, setViewerName] = useState<string | null>(null);
  const [viewerPfp, setViewerPfp] = useState<string | null>(null);

  // Same header logic as on the main page
  useEffect(() => {
    async function initHeader() {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("sdk.actions.ready() failed (Leaderboard):", e);
      }

      try {
        const ctx: any = await sdk.context;

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
        setViewerName(prev => prev || "BBOX player");
      }
    }

    if (typeof window !== "undefined") {
      void initHeader();
    }
  }, []);

  const displayName = viewerName || "BBOX player";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  // Load leaderboard data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/leaderboard");
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
    load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen p-4 flex flex-col items-center">
        <div className="w-full max-w-md space-y-4">
          {/* Common header */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-baseBlue to-purple-500 flex items-center justify-center text-xs font-bold">
                B
              </div>
              <span className="text-xl font-semibold">BBOX</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              {viewerPfp ? (
                <img
                  src={viewerPfp}
                  alt="User avatar"
                  className="h-8 w-8 rounded-full border border-gray-600 object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-gray-600 flex items-center justify-center text-sm font-semibold">
                  {avatarInitial}
                </div>
              )}
              <span className="text-xs text-gray-300 max-w-[160px] truncate text-right">
                {displayName}
              </span>
            </div>
          </header>

          <p className="text-sm text-gray-400 text-center mt-4">
            Loading leaderboard…
          </p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-4 flex flex-col items-center">
        <div className="w-full max-w-md space-y-4">
          {/* Common header */}
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-baseBlue to-purple-500 flex items-center justify-center text-xs font-bold">
                B
              </div>
              <span className="text-xl font-semibold">BBOX</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              {viewerPfp ? (
                <img
                  src={viewerPfp}
                  alt="User avatar"
                  className="h-8 w-8 rounded-full border border-gray-600 object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-gray-600 flex items-center justify-center text-sm font-semibold">
                  {avatarInitial}
                </div>
              )}
              <span className="text-xs text-gray-300 max-w-[160px] truncate text-right">
                {displayName}
              </span>
            </div>
          </header>

          {/* Page-specific top bar */}
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

  return (
    <main className="min-h-screen p-4 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        {/* COMMON HEADER (same as main) */}
        <header className="flex items-center justify-between">
          {/* Logo + app name (left) */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-baseBlue to-purple-500 flex items-center justify-center text-xs font-bold">
              B
            </div>
            <span className="text-xl font-semibold">BBOX</span>
          </div>

          {/* User avatar + username (right) */}
          <div className="flex flex-col items-end gap-1">
            {viewerPfp ? (
              <img
                src={viewerPfp}
                alt="User avatar"
                className="h-8 w-8 rounded-full border border-gray-600 object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-gray-600 flex items-center justify-center text-sm font-semibold">
                {avatarInitial}
              </div>
            )}
            <span className="text-xs text-gray-300 max-w-[160px] truncate text-right">
              {displayName}
            </span>
          </div>
        </header>

        {/* Page-specific top bar */}
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

        {/* Leaderboard content */}
        <div className="space-y-3 mt-1">
          {rows.map((r, index) => (
            <div
              key={r.fid}
              className="rounded-xl border border-gray-800 bg-gray-950/80 p-4 space-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">#{index + 1}</span>
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
