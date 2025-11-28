"use client";

import { useEffect, useState } from "react";
import type { ApiUserState } from "@/types";

type PickResult = {
  rarity: "common" | "rare" | "epic" | "legendary";
  points: number;
};

declare global {
  interface Window {
    MiniKit?: {
      context?: () => Promise<{
        viewer?: {
          fid?: number;
          username?: string;
        };
      }>;
    };
  }
}

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
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);

  // 1) FID detektálása MiniKit-ből vagy fallbackből
  useEffect(() => {
    async function initFid() {
      if (typeof window === "undefined") return;

      // 1. próba: MiniKit context (amikor Farcaster MiniApp-ból nyitják)
      try {
        if (window.MiniKit && typeof window.MiniKit.context === "function") {
          const ctx = await window.MiniKit.context();
          const viewerFid = ctx?.viewer?.fid;
          if (viewerFid && Number.isFinite(viewerFid)) {
            setFid(viewerFid);
            return;
          }
        }
      } catch (e) {
        console.warn("MiniKit context error (fallback to query/dev fid)", e);
      }

      // 2. próba: ?fid=... query param (lokális / dev teszt)
      const fromQuery = getFidFromQuery();
      if (fromQuery) {
        setFid(fromQuery);
        return;
      }

      // 3. próba: dev fallback – csak helyi tesztre
      setFid(123456);
    }

    initFid();
  }, []);

  // 2) User állapot betöltése, ha már van FID
  async function loadState(currentFid: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        headers: {
          "x-bbox-fid": String(currentFid)
        }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load state");
      } else {
        setUser(data);
        if (data.nextFreeRefillAt && data.freePicksRemaining === 0 && data.extraPicksBalance === 0) {
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
    loadState(fid);
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
      const res = await fetch("/api/pick", {
        method: "POST",
        headers: {
          "x-bbox-fid": String(fid)
        }
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

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-baseBlue">BBOX</h1>
          <p className="text-sm text-gray-300">
            Daily Based Box game. Pick a box, earn points, climb the leaderboard.
          </p>
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
            <section className="rounded-xl border border-gray-800 p-4 space-y-2 bg-gray-950/60">
              <p className="text-sm text-gray-400">
                FID: <span className="font-mono text-gray-200">{user.fid}</span>
              </p>
              <p className="text-sm">
                Total points: <span className="font-semibold">{user.totalPoints}</span>
              </p>
              <p className="text-sm">
                Free picks today:{" "}
                <span className="font-semibold">{user.freePicksRemaining}</span>
              </p>
              <p className="text-sm">
                Extra picks:{" "}
                <span className="font-semibold">{user.extraPicksBalance}</span>
              </p>
              {user.isOg && (
                <p className="inline-flex items-center rounded-full bg-baseBlue/20 px-3 py-1 text-xs font-semibold text-baseBlue mt-1">
                  BBOX OG
                </p>
              )}
              {!canPick && user.nextFreeRefillAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Next free pick in:{" "}
                  <span className="font-mono">{countdown ?? "00:00:00"}</span>
                </p>
              )}
            </section>

            <section className="rounded-xl border border-gray-800 p-4 bg-gray-950/60 space-y-4">
              <h2 className="text-lg font-semibold text-center">Pick your BBOX</h2>
              <p className="text-xs text-center text-gray-400">
                Each pick reveals one of three boxes. One pick = one opening.
              </p>

              <div className="grid grid-cols-3 gap-3 mt-3">
                {[0, 1, 2].map(i => (
                  <button
                    key={i}
                    disabled={!canPick || picking}
                    onClick={handlePick}
                    className="h-20 rounded-lg border border-gray-700 bg-gradient-to-b from-gray-900 to-gray-950 flex items-center justify-center text-sm font-semibold hover:border-baseBlue disabled:opacity-40 disabled:hover:border-gray-700 transition"
                  >
                    {canPick ? "BOX" : "—"}
                  </button>
                ))}
              </div>

              <button
                disabled={!canPick || picking}
                onClick={handlePick}
                className="w-full mt-3 rounded-lg bg-baseBlue py-2 text-sm font-semibold disabled:opacity-50"
              >
                {picking ? "Opening..." : "Open a box"}
              </button>

              {lastResult && (
                <div className="mt-4 rounded-lg border border-gray-800 p-3 text-sm space-y-1">
                  <p>
                    You opened a{" "}
                    <span
                      className={
                        lastResult.rarity === "legendary"
                          ? "text-legendary font-bold"
                          : lastResult.rarity === "epic"
                          ? "text-epic font-semibold"
                          : lastResult.rarity === "rare"
                          ? "text-rare font-semibold"
                          : "text-gray-200 font-medium"
                      }
                    >
                      {lastResult.rarity.toUpperCase()} box
                    </span>
                    !
                  </p>
                  <p>
                    Reward:{" "}
                    <span className="font-semibold text-baseBlue">
                      +{lastResult.points} points
                    </span>
                  </p>
                  <button
                    className="mt-2 inline-flex items-center rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-200 hover:border-baseBlue"
                    onClick={() => {
                      const text = `I just opened a ${lastResult.rarity.toUpperCase()} box on BBOX and got +${lastResult.points} points 🔥`;
                      if (navigator.share) {
                        navigator
                          .share({
                            text
                          })
                          .catch(() => {});
                      } else {
                        navigator.clipboard.writeText(text).catch(() => {});
                        alert("Share text copied to clipboard!");
                      }
                    }}
                  >
                    Share result
                  </button>
                </div>
              )}

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
      </div>
    </main>
  );
}
