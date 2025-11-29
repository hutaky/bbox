// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import sdk from "@farcaster/frame-sdk";
import type { ApiUserState } from "@/types";

type BoxRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

interface LastResult {
  rarity: BoxRarity;
  points: number;
  openedAt: string;
}

function formatCountdown(nextFreePickAt: string | null): string {
  if (!nextFreePickAt) return "Ready";
  const target = new Date(nextFreePickAt).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return "Ready";

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getFidFromQuery(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const fidParam = params.get("fid");
  if (!fidParam) return null;
  const fid = Number(fidParam);
  return Number.isFinite(fid) ? fid : null;
}

export default function HomePage() {
  const [fid, setFid] = useState<number | null>(null);
  const [user, setUser] = useState<ApiUserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [countdown, setCountdown] = useState<string>("");

  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showOgModal, setShowOgModal] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  // ---- User state betöltése ----
  async function loadUserState(currentFid: number | null) {
    if (!currentFid) return;
    try {
      const res = await fetch("/api/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid: currentFid }),
      });
      const data = await res.json();
      setUser(data);

      if (data?.nextFreePickAt) {
        setCountdown(formatCountdown(data.nextFreePickAt));
      } else {
        setCountdown("Ready");
      }

      if (data?.lastResult) {
        setLastResult(data.lastResult);
      }
    } catch (err) {
      console.error("Failed to load user state:", err);
    }
  }

  // ---- Mini app init (Farcaster SDK) ----
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await sdk.actions.ready();

        const context = await sdk.context;
        const ctxFid = context?.user?.fid ?? null;
        const queryFid = getFidFromQuery();
        const finalFid = ctxFid || queryFid;

        if (!cancelled) {
          setFid(finalFid);
          await loadUserState(finalFid);
        }
      } catch (e) {
        console.error("Error initializing mini app SDK:", e);
        const queryFid = getFidFromQuery();
        if (!cancelled) {
          setFid(queryFid);
          await loadUserState(queryFid);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Countdown frissítése ----
  useEffect(() => {
    if (!user?.nextFreePickAt) {
      setCountdown("Ready");
      return;
    }
    const interval = setInterval(() => {
      setCountdown(formatCountdown(user.nextFreePickAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [user?.nextFreePickAt]);

  const canPick =
    (user?.freePicksRemaining ?? 0) > 0 ||
    (user?.extraPicksRemaining ?? 0) > 0;

  // ---- Box pick ----
  async function handlePick(boxIndex: number) {
    if (!fid || !user || picking) return;
    if (!canPick) return;

    try {
      setPicking(true);
      const res = await fetch("/api/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid, boxIndex }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Pick error:", data);
        alert(data.error ?? "Failed to open box.");
        return;
      }

      const data = await res.json();

      const updated: ApiUserState = {
        ...user,
        totalPoints: data.totalPoints,
        freePicksRemaining: data.freePicksRemaining,
        extraPicksRemaining: data.extraPicksRemaining,
        nextFreePickAt: data.nextFreePickAt,
        commonOpens: data.commonOpens,
        rareOpens: data.rareOpens,
        epicOpens: data.epicOpens,
        legendaryOpens: data.legendaryOpens,
      };

      setUser(updated);
      setLastResult({
        rarity: data.rarity,
        points: data.points,
        openedAt: new Date().toISOString(),
      });
      setShowResultModal(true);
    } catch (err) {
      console.error("Pick failed:", err);
      alert("Something went wrong, try again.");
    } finally {
      setPicking(false);
    }
  }

  // ---- Sharing ----
  async function handleShareResult() {
    if (!lastResult || !user) return;
    const rarityLabel = lastResult.rarity.toLowerCase();
    const text = `I just opened a ${rarityLabel} box on BBOX and earned +${lastResult.points} points!`;

    try {
      await sdk.actions.openUrl(
        `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`
      );
    } catch (e) {
      console.error("Share failed:", e);
      alert("Could not open share dialog.");
    }
  }

  // ---- Neynar Pay: extra picks ----
  async function handleBuyExtra(packSize: 1 | 5 | 10) {
    if (!fid) {
      alert("Missing FID, please open from Farcaster.");
      return;
    }
    try {
      setBuyLoading(true);
      setBuyError(null);

      const res = await fetch("/api/pay/extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid, packSize }),
      });

      const data = await res.json();

      if (!res.ok || !data.frameUrl || !data.frameId) {
        console.error("Failed to create pay frame:", data);
        setBuyError(data.error ?? "Payment creation failed.");
        return;
      }

      // Fizetési frame megnyitása
      await sdk.actions.openUrl(data.frameUrl);

      // Visszatérés után confirm tick
      const confirmRes = await fetch("/api/pay/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid, frameId: data.frameId }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        console.error("Confirm error:", confirmData);
        setBuyError(confirmData.error ?? "Payment confirm failed.");
      } else if (confirmData.status === "completed") {
        // újratöltjük a user state-et
        await loadUserState(fid);
      } else if (confirmData.status === "pending") {
        // még nincs kész, de a következő belépéskor úgyis ellenőrizzük
        console.log("Payment still pending.");
      }
    } catch (err) {
      console.error("Error in handleBuyExtra:", err);
      setBuyError("Something went wrong, try again.");
    } finally {
      setBuyLoading(false);
    }
  }

  // ---- Neynar Pay: OG rank ----
  async function handleBuyOg() {
    if (!fid) {
      alert("Missing FID, please open from Farcaster.");
      return;
    }
    try {
      setBuyLoading(true);
      setBuyError(null);

      const res = await fetch("/api/pay/og", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid }),
      });

      const data = await res.json();

      if (!res.ok || !data.frameUrl || !data.frameId) {
        console.error("Failed to create OG pay frame:", data);
        setBuyError(data.error ?? "OG payment creation failed.");
        return;
      }

      await sdk.actions.openUrl(data.frameUrl);

      const confirmRes = await fetch("/api/pay/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid, frameId: data.frameId }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        console.error("OG confirm error:", confirmData);
        setBuyError(confirmData.error ?? "OG payment confirm failed.");
      } else if (confirmData.status === "completed") {
        await loadUserState(fid);
      } else if (confirmData.status === "pending") {
        console.log("OG payment still pending.");
      }
    } catch (err) {
      console.error("Error in handleBuyOg:", err);
      setBuyError("Something went wrong, try again.");
    } finally {
      setBuyLoading(false);
    }
  }

  // ---- UI helpers ----
  function renderRarityLabel(rarity: BoxRarity) {
    switch (rarity) {
      case "COMMON":
        return "COMMON box";
      case "RARE":
        return "RARE box";
      case "EPIC":
        return "EPIC box";
      case "LEGENDARY":
        return "LEGENDARY box";
      default:
        return "box";
    }
  }

  function renderRarityBadge(rarity: BoxRarity) {
    const baseClass =
      "px-2 py-1 rounded-full text-xs font-semibold border";
    switch (rarity) {
      case "COMMON":
        return (
          <span className={`${baseClass} border-gray-500 text-gray-200`}>
            COMMON
          </span>
        );
      case "RARE":
        return (
          <span className={`${baseClass} border-rare text-rare`}>
            RARE
          </span>
        );
      case "EPIC":
        return (
          <span className={`${baseClass} border-epic text-epic`}>
            EPIC
          </span>
        );
      case "LEGENDARY":
        return (
          <span className={`${baseClass} border-legendary text-legendary`}>
            LEGENDARY
          </span>
        );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin h-8 w-8 border-2 border-baseBlue border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-400">Loading BBOX…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-md mx-auto px-4 pb-6 pt-4">
        {/* HEADER */}
        <header className="flex items-center justify-between mb-4">
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
            {user?.pfpUrl && (
              <img
                src={user.pfpUrl}
                alt={user.username}
                className="w-9 h-9 rounded-full border border-baseBlue/40"
              />
            )}
            <div className="text-right">
              <div className="text-sm font-medium truncate">
                {user?.username ?? "Guest"}
              </div>
              {fid && (
                <div className="text-[11px] text-gray-500">
                  FID #{fid}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* STATS CARD */}
        <section className="bg-gradient-to-br from-baseBlue/10 via-baseBlue/5 to-black border border-baseBlue/40 rounded-2xl px-4 py-3 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Total points</span>
                <span>{user?.totalPoints ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Extra picks</span>
                <span>{user?.extraPicksRemaining ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>Free picks</span>
                <span>{user?.freePicksRemaining ?? 0}</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-2">
                Next free box:{" "}
                <span className="text-gray-300">
                  {countdown || "Ready"}
                </span>
              </div>
              {user?.isOg && (
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-800/30 border border-purple-500/60 text-[11px] text-purple-200">
                  <span className="text-[10px]">★</span>
                  <span>OG Box Opener</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowBuyModal(true)}
              className="ml-3 inline-flex flex-col items-end justify-center px-3 py-2 rounded-xl bg-baseBlue hover:bg-baseBlue/90 text-xs font-medium transition"
            >
              <span>Buy extra</span>
              <span className="text-[10px] text-blue-100/80">
                +1 / +5 / +10 picks
              </span>
            </button>
          </div>
        </section>

        {/* INFO / NO PICKS MESSAGE */}
        {!canPick && (
          <div className="mb-3 text-xs text-yellow-300/90 bg-yellow-500/10 border border-yellow-500/40 rounded-xl px-3 py-2">
            <div className="font-medium mb-1">No boxes left to open</div>
            <p className="text-[11px]">
              Come back when the countdown hits{" "}
              <span className="font-semibold">Ready</span>, 
              or buy extra picks to keep opening today.
            </p>
          </div>
        )}

        {/* BOX GRID */}
        <section className="bg-zinc-900/80 border border-zinc-800 rounded-2xl px-4 py-4 mb-4">
          <h2 className="text-sm font-medium mb-3">Pick your box</h2>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => handlePick(index)}
                disabled={!canPick || picking}
                className={`relative aspect-square rounded-2xl flex items-center justify-center border text-3xl transition transform active:scale-95
                  ${
                    !canPick || picking
                      ? "border-zinc-700 bg-zinc-900 text-zinc-600 cursor-not-allowed"
                      : "border-baseBlue/50 bg-gradient-to-br from-baseBlue/15 via-zinc-900 to-black hover:from-baseBlue/25"
                  }`}
              >
                <span>📦</span>
              </button>
            ))}
          </div>

          <button
            onClick={() =>
              canPick
                ? handlePick(Math.floor(Math.random() * 3))
                : setShowBuyModal(true)
            }
            disabled={picking}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition
              ${
                picking
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : canPick
                  ? "bg-baseBlue hover:bg-baseBlue/90 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
          >
            {picking
              ? "Opening..."
              : canPick
              ? "Random open"
              : "Buy extra"}
          </button>
        </section>

        {/* NAV BUTTONS */}
        <section className="flex gap-2">
          <Link
            href="/leaderboard"
            className="flex-1 text-center text-xs py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition"
          >
            Leaderboard
          </Link>
          <Link
            href="/faq"
            className="flex-1 text-center text-xs py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition"
          >
            FAQ
          </Link>
        </section>
      </div>

      {/* RESULT MODAL */}
      {showResultModal && lastResult && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 relative">
            <button
              onClick={() => setShowResultModal(false)}
              className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 text-sm"
            >
              ✕
            </button>
            <div className="text-center mt-2">
              <div className="mb-3 flex justify-center">
                {renderRarityBadge(lastResult.rarity)}
              </div>
              <h3 className="text-sm font-semibold mb-2">
                You opened a {renderRarityLabel(lastResult.rarity)}!
              </h3>
              <p className="text-lg font-bold text-baseBlue mb-1">
                Reward: +{lastResult.points} points
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Keep opening boxes to climb the leaderboard.
              </p>
              <button
                onClick={handleShareResult}
                className="w-full py-2 rounded-xl bg-baseBlue hover:bg-baseBlue/90 text-xs font-semibold mb-2"
              >
                Share on Farcaster
              </button>
              <button
                onClick={() => setShowResultModal(false)}
                className="w-full py-2 rounded-xl border border-zinc-700 text-xs text-gray-300 hover:bg-zinc-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BUY MODAL */}
      {showBuyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 relative">
            <button
              onClick={() => {
                setShowBuyModal(false);
                setBuyError(null);
              }}
              className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 text-sm"
            >
              ✕
            </button>

            <div className="text-center mt-1 mb-3">
              <h3 className="text-sm font-semibold mb-1">Buy extra picks</h3>
              <p className="text-[11px] text-gray-400">
                Pay with Base USDC via Neynar Pay. Picks don&apos;t expire and
                can be used on any day.
              </p>
            </div>

            <div className="space-y-2 mb-3">
              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(1)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                <span>+1 extra pick</span>
                <span className="text-gray-300">
                  {process.env.NEXT_PUBLIC_BBOX_PRICE_1 ?? "0.5 USDC"}
                </span>
              </button>
              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(5)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                <span>+5 extra picks</span>
                <span className="text-gray-300">
                  {process.env.NEXT_PUBLIC_BBOX_PRICE_5 ?? "2.0 USDC"}
                </span>
              </button>
              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(10)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                <span>+10 extra picks</span>
                <span className="text-gray-300">
                  {process.env.NEXT_PUBLIC_BBOX_PRICE_10 ?? "3.5 USDC"}
                </span>
              </button>
            </div>

            <div className="border-t border-zinc-800 pt-3 mt-2">
              <button
                disabled={buyLoading}
                onClick={() => {
                  setShowBuyModal(false);
                  setShowOgModal(true);
                  setBuyError(null);
                }}
                className="w-full text-[11px] text-purple-300 hover:text-purple-200 underline decoration-dotted"
              >
                Become an OG box opener
              </button>
            </div>

            {buyError && (
              <p className="mt-3 text-[11px] text-red-400 text-center">
                {buyError}
              </p>
            )}

            {buyLoading && (
              <p className="mt-2 text-[11px] text-gray-400 text-center">
                Opening Neynar Pay…
              </p>
            )}
          </div>
        </div>
      )}

      {/* OG MODAL */}
      {showOgModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 relative">
            <button
              onClick={() => {
                setShowOgModal(false);
                setBuyError(null);
              }}
              className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 text-sm"
            >
              ✕
            </button>

            <div className="mt-1 mb-3">
              <h3 className="text-sm font-semibold mb-1 text-center">
                Become OG
              </h3>
              <p className="text-[11px] text-gray-400 text-center">
                One-time purchase, FID-bound. OGs get a permanent daily buff
                (extra free box) and a unique badge in BBOX.
              </p>
            </div>

            <button
              disabled={buyLoading}
              onClick={handleBuyOg}
              className="w-full py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-xs font-semibold mb-2"
            >
              Become OG ({process.env.NEXT_PUBLIC_BBOX_OG_PRICE ?? "5.0"} USDC)
            </button>

            <button
              onClick={() => setShowOgModal(false)}
              className="w-full py-2 rounded-xl border border-zinc-700 text-xs text-gray-300 hover:bg-zinc-900"
            >
              Maybe later
            </button>

            {buyError && (
              <p className="mt-3 text-[11px] text-red-400 text-center">
                {buyError}
              </p>
            )}

            {buyLoading && (
              <p className="mt-2 text-[11px] text-gray-400 text-center">
                Opening Neynar Pay…
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
