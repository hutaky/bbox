"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import sdk from "@farcaster/frame-sdk";
import type { ApiUserState } from "@/types";

type PickResult = {
  rarity: "common" | "rare" | "epic" | "legendary";
  points: number;
};

function formatCountdown(targetIso: string | null): string | null {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return "00:00:00";
  const totalSeconds = Math.floor(diff / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function getFidFromQuery(): number | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const fidParam = url.searchParams.get("fid");
  if (!fidParam) return null;
  const fid = Number(fidParam);
  return Number.isFinite(fid) ? fid : null;
}

export default function HomePage() {
  const [fid, setFid] = useState<number | null>(null);
  const [user, setUser] = useState<ApiUserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [lastResult, setLastResult] = useState<PickResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  const [viewerName, setViewerName] = useState<string | null>(null);
  const [viewerPfp, setViewerPfp] = useState<string | null>(null);

  // 1) Farcaster MiniApp init + FID / username / pfp detektálás
  useEffect(() => {
    async function init() {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("sdk.actions.ready() failed (ok böngészőben):", e);
      }

      try {
        const ctx: any = await sdk.context;

        const viewerFid =
          ctx?.user?.fid ??
          ctx?.viewer?.fid ??
          ctx?.viewerContext?.user?.fid ??
          null;

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
        }
        if (pfp && typeof pfp === "string") {
          setViewerPfp(pfp);
        }

        if (viewerFid && Number.isFinite(viewerFid)) {
          setFid(viewerFid);
          return;
        }
      } catch (e) {
        console.warn("sdk.context read failed, fallback to query/dev fid:", e);
      }

      const fromQuery = getFidFromQuery();
      if (fromQuery) {
        setFid(fromQuery);
      } else {
        setFid(123456); // dev fallback
      }
    }

    if (typeof window !== "undefined") {
      void init();
    }
  }, []);

  // 2) User state betöltése, ha már van FID
  async function loadState(currentFid: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/me?fid=${currentFid}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load state");
      } else {
        setUser(data);
        if (
          data.nextFreeRefillAt &&
          data.freePicksRemaining === 0 &&
          data.extraPicksBalance === 0
        ) {
          setCountdown(formatCountdown(data.nextFreeRefillAt));
        } else {
          setCountdown(null);
        }
      }
    } catch (e: any) {
      console.error(e);
      setError("Failed to load state");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fid == null) return;
    void loadState(fid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid]);

  // 3) Countdown frissítés
  useEffect(() => {
    let timer: any;
    if (
      user &&
      user.nextFreeRefillAt &&
      user.freePicksRemaining === 0 &&
      user.extraPicksBalance === 0
    ) {
      timer = setInterval(() => {
        const text = formatCountdown(user.nextFreeRefillAt);
        setCountdown(text);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [user]);

  // 4) Box pick
  async function handlePick() {
    if (!user || fid == null) return;
    if (picking) return;
    setPicking(true);
    setError(null);
    try {
      const res = await fetch(`/api/pick?fid=${fid}`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to pick");
        if (data.nextFreeRefillAt) {
          setUser(prev =>
            prev
              ? {
                  ...prev,
                  freePicksRemaining: 0,
                  extraPicksBalance: 0,
                  nextFreeRefillAt: data.nextFreeRefillAt
                }
              : prev
          );
        }
      } else {
        const updated: ApiUserState = {
          fid: user.fid,
          username: user.username,
          isOg: user.isOg,
          totalPoints: data.totalPoints,
          freePicksRemaining: data.freePicksRemaining,
          extraPicksBalance: data.extraPicksBalance,
          nextFreeRefillAt: data.nextFreeRefillAt
        };
        setUser(updated);
        setLastResult({ rarity: data.rarity, points: data.points });
        setShowResultModal(true);
      }
    } catch (e: any) {
      console.error(e);
      setError("Failed to pick");
    } finally {
      setPicking(false);
    }
  }

  const canPick =
    user &&
    (user.freePicksRemaining > 0 || user.extraPicksBalance > 0);

  const initializing = fid == null;

  function handleShareResult() {
    if (!lastResult) return;
    const text = `I just opened a ${lastResult.rarity.toUpperCase()} box on BBOX and got +${lastResult.points} points 🔥`;
    if (navigator.share) {
      navigator
        .share({ text })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(text).catch(() => {});
      alert("Share text copied to clipboard!");
    }
  }

  const displayName =
    viewerName ||
    (user?.username && user.username.trim().length > 0
      ? user.username
      : "BBOX player");

  const avatarInitial = displayName.charAt(0).toUpperCase();

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md space-y-5">
        {/* HEADER */}
        <header className="flex items-center justify-between">
          {/* Logo + app name (balra) */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-baseBlue to-purple-500 flex items-center justify-center text-xs font-bold">
              B
            </div>
            <span className="text-xl font-semibold">BBOX</span>
          </div>

          {/* User avatar + username (jobbra) */}
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

        {initializing && (
          <p className="text-center text-sm text-gray-400">
            Initializing BBOX MiniApp…
          </p>
        )}

        {!initializing && loading && (
          <p className="text-center text-sm text-gray-400">
            Loading your BBOX profile…
          </p>
        )}

        {!initializing && !loading && user && (
          <>
            {/* INFO CARD */}
            <section className="rounded-2xl border border-gray-800 p-4 bg-gray-950/70 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Total points (balra, egy sorban) */}
                <div className="text-left">
                  <p className="text-xs text-gray-400">
                    Total points{" "}
                    <span className="text-base font-semibold text-gray-100">
                      {user.totalPoints}
                    </span>
                  </p>
                </div>

                {/* Extra picks (jobbra, egy sorban) */}
                <div className="text-right">
                  <p className="text-xs text-gray-400">
                    Extra picks{" "}
                    <span className="text-base font-semibold text-gray-100">
                      {user.extraPicksBalance}
                    </span>
                  </p>
                </div>

                {/* Free picks (balra, egy sorban) */}
                <div className="text-left">
                  <p className="text-xs text-gray-400">
                    Free picks{" "}
                    <span className="text-base font-semibold text-gray-100">
                      {user.freePicksRemaining}
                    </span>
                  </p>
                </div>

                {/* Buy picks gomb (jobbra) */}
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    className="rounded-full border border-baseBlue/70 px-3 py-1 text-xs font-semibold text-baseBlue hover:bg-baseBlue/10"
                  >
                    Buy picks
                  </button>
                </div>
              </div>

              {user.isOg && (
                <p className="inline-flex items-center rounded-full bg-baseBlue/20 px-3 py-1 text-xs font-semibold text-baseBlue mt-1">
                  BBOX OG
                </p>
              )}

              {!canPick && user.nextFreeRefillAt && (
                <p className="text-xs text-gray-400 mt-1">
                  Next free pick in:{" "}
                  <span className="font-mono">{countdown ?? "00:00:00"}</span>
                </p>
              )}
            </section>

            {/* BOX AREA */}
            <section className="rounded-2xl border border-gray-800 p-4 bg-gray-950/70 space-y-4">
              <h2 className="text-lg font-semibold text-center">Pick your BBOX</h2>
              <p className="text-xs text-center text-gray-400">
                Each pick reveals one of three boxes. One pick = one opening.
              </p>

              {/* Box ikonok */}
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[0, 1, 2].map(i => (
                  <button
                    key={i}
                    disabled={!canPick || picking}
                    onClick={handlePick}
                    className="h-20 rounded-xl border border-gray-700 bg-gradient-to-b from-gray-900 to-black flex flex-col items-center justify-center text-xs font-medium hover:border-baseBlue disabled:opacity-40 disabled:hover:border-gray-700 transition"
                  >
                    <div className="text-2xl mb-1">📦</div>
                    <span className="text-[11px] tracking-wide uppercase text-gray-300">
                      Box
                    </span>
                  </button>
                ))}
              </div>

              {/* Fő gomb */}
              <button
                disabled={!canPick || picking}
                onClick={handlePick}
                className="w-full mt-3 rounded-full bg-baseBlue py-2 text-sm font-semibold disabled:opacity-50"
              >
                {picking ? "Opening..." : "Random open"}
              </button>

              {error && (
                <p className="mt-3 text-xs text-red-400 text-center">{error}</p>
              )}
            </section>
          </>
        )}

        {!initializing && !loading && !user && (
          <p className="text-center text-xs text-red-400">
            Failed to load user state. Make sure you opened BBOX from Farcaster,
            or add <code>?fid=YOUR_FID</code> to the URL for testing.
          </p>
        )}

        {/* BOTTOM NAV BUTTONS: Leaderboard + FAQ */}
        <div className="flex gap-3 pt-2">
          <Link
            href="/leaderboard"
            className="flex-1 rounded-full border border-gray-700 px-3 py-2 text-xs font-medium text-gray-200 text-center hover:border-baseBlue"
          >
            Leaderboard
          </Link>
          <Link
            href="/faq"
            className="flex-1 rounded-full border border-gray-700 px-3 py-2 text-xs font-medium text-gray-200 text-center hover:border-baseBlue"
          >
            FAQ
          </Link>
        </div>
      </div>

      {/* Result modal overlay */}
      {showResultModal && lastResult && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-sm mx-4 rounded-2xl border border-gray-800 bg-gray-950 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-100">Box result</h3>
              <button
                onClick={() => setShowResultModal(false)}
                className="text-gray-400 hover:text-gray-200 text-sm"
                aria-label="Close result"
              >
                ✕
              </button>
            </div>

            {/* Látványos eredmény box */}
            <div className="rounded-xl border border-gray-700 bg-gray-900/80 p-3 text-center space-y-1">
              <p className="text-sm">
                You opened a{" "}
                <span
                  className={
                    lastResult.rarity === "legendary"
                      ? "text-legendary font-bold"
                      : lastResult.rarity === "epic"
                      ? "text-epic font-semibold"
                      : lastResult.rarity === "rare"
                      ? "text-rare font-semibold"
                      : "text-gray-100 font-medium"
                  }
                >
                  {lastResult.rarity.toUpperCase()} box
                </span>
                !
              </p>
              <p className="text-sm">
                Reward:{" "}
                <span className="font-semibold text-baseBlue">
                  +{lastResult.points} points
                </span>
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleShareResult}
                className="flex-1 inline-flex items-center justify-center rounded-full border border-gray-700 px-3 py-2 text-xs font-medium text-gray-200 hover:border-baseBlue"
              >
                Share result
              </button>
              <button
                onClick={() => setShowResultModal(false)}
                className="px-3 py-2 text-xs font-medium text-gray-300 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
