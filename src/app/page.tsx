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

// ---- Account rank név (Based / PRO / OG / PRO OG) ----
function getAccountRank(user: ApiUserState | null): string {
  if (!user) return "BOX Based";
  if (user.isPro && user.isOg) return "BOX PRO OG";
  if (user.isOg) return "BOX OG";
  if (user.isPro) return "BOX PRO";
  return "BOX Based";
}

// ---- Tier (ligák) a pontszám alapján ----
function getTier(totalPoints: number | undefined) {
  const pts = totalPoints ?? 0;

  if (pts >= 30000) {
    return {
      name: "Platinum League",
      badgeClass:
        "bg-gradient-to-r from-cyan-400/20 via-blue-500/20 to-purple-500/20 border border-cyan-400/60",
      colorClass: "text-cyan-200",
    };
  }
  if (pts >= 20000) {
    return {
      name: "Gold League",
      badgeClass:
        "bg-gradient-to-r from-amber-400/20 via-yellow-500/20 to-orange-500/20 border border-amber-400/60",
      colorClass: "text-amber-200",
    };
  }
  if (pts >= 10000) {
    return {
      name: "Silver League",
      badgeClass:
        "bg-gradient-to-r from-slate-200/15 via-slate-400/15 to-slate-200/15 border border-slate-300/60",
      colorClass: "text-slate-100",
    };
  }
  return {
    name: "Bronze League",
    badgeClass:
      "bg-gradient-to-r from-amber-700/30 via-orange-700/20 to-amber-800/30 border border-amber-500/60",
    colorClass: "text-amber-100",
  };
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
        isOg: user.isOg,
        isPro: user.isPro,
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

      await sdk.actions.openUrl(data.frameUrl);

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
        await loadUserState(fid);
      } else if (confirmData.status === "pending") {
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

  // ---- UI helpers (rarity badge) ----
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
      "px-3 py-1 rounded-full text-xs font-semibold border shadow-[0_0_20px_rgba(37,99,235,0.35)]";
    switch (rarity) {
      case "COMMON":
        return (
          <span
            className={`${baseClass} border-slate-500/70 text-slate-100 bg-slate-900/80`}
          >
            COMMON
          </span>
        );
      case "RARE":
        return (
          <span
            className={`${baseClass} border-rare text-rare bg-sky-900/60`}
          >
            RARE
          </span>
        );
      case "EPIC":
        return (
          <span
            className={`${baseClass} border-epic text-epic bg-purple-900/60`}
          >
            EPIC
          </span>
        );
      case "LEGENDARY":
        return (
          <span
            className={`${baseClass} border-legendary text-legendary bg-amber-900/60`}
          >
            LEGENDARY
          </span>
        );
    }
  }

  const accountRank = getAccountRank(user);
  const tier = getTier(user?.totalPoints);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-black text-white flex items-center justify-center">
        <div className="relative text-center space-y-3">
          <div className="absolute inset-0 blur-2xl bg-baseBlue/40 opacity-40 -z-10" />
          <div className="animate-spin h-9 w-9 border-[3px] border-baseBlue border-t-transparent rounded-full mx-auto" />
          <p className="text-xs tracking-wide text-slate-300 uppercase">
            Booting BBOX…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#02040b] text-white">
      {/* finom háttér zaj + glow */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.18] mix-blend-screen bg-[radial-gradient(circle_at_0%_0%,#2563eb55_0,transparent_45%),radial-gradient(circle_at_100%_0%,#7c3aed55_0,transparent_40%),radial-gradient(circle_at_50%_100%,#22c55e40_0,transparent_45%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[url('/noise.png')] opacity-30 mix-blend-soft-light" />

      <div className="relative max-w-md mx-auto px-4 pb-6 pt-4">
        {/* HEADER */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src="/icon.png"
                alt="BBOX logo"
                className="w-9 h-9 rounded-xl border border-baseBlue/50 shadow-[0_0_22px_rgba(37,99,235,0.6)] bg-black/60"
              />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
            </div>
            <div className="leading-tight">
              <h1 className="text-[22px] font-semibold tracking-tight">
                BBOX
              </h1>
              <p className="text-[11px] text-slate-300">
                Daily Based Box game
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user?.pfpUrl && (
              <div className="relative">
                <img
                  src={user.pfpUrl}
                  alt={user.username ?? "Player"}
                  className="w-9 h-9 rounded-full border border-baseBlue/40 shadow-[0_0_18px_rgba(37,99,235,0.5)] object-cover"
                />
                <div className="absolute -bottom-1 right-0 px-1.5 py-[1px] rounded-full bg-black/80 border border-slate-600/60 text-[9px] text-slate-200">
                  FID {fid ?? "–"}
                </div>
              </div>
            )}
            <div className="text-right">
              <div className="text-xs font-medium max-w-[140px] truncate">
                {user?.username ?? "Guest"}
              </div>
              <div className="text-[10px] text-slate-400">
                {accountRank}
              </div>
            </div>
          </div>
        </header>

        {/* STATS + RANK CARD */}
        <section className="relative bg-gradient-to-br from-slate-950 via-slate-950/90 to-slate-950/70 border border-slate-800/80 rounded-3xl px-4 py-4 mb-4 shadow-[0_0_32px_rgba(15,23,42,0.9)] overflow-hidden">
          <div className="absolute -top-16 -right-10 w-40 h-40 bg-[radial-gradient(circle,#1d4ed8_0,transparent_60%)] opacity-40" />
          <div className="absolute -bottom-20 left-0 w-40 h-40 bg-[radial-gradient(circle,#22c55e_0,transparent_60%)] opacity-25" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-300">
                <span className="uppercase tracking-[0.14em] text-[10px] text-slate-400">
                  Total points
                </span>
                <span className="font-semibold text-[13px] text-sky-100">
                  {user?.totalPoints ?? 0}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Extra picks</span>
                <span className="font-medium text-emerald-300">
                  {user?.extraPicksRemaining ?? 0}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Free picks</span>
                <span className="font-medium text-amber-200">
                  {user?.freePicksRemaining ?? 0}
                </span>
              </div>
              <div className="mt-2 text-[11px]">
                <span className="text-slate-400">Next free box: </span>
                <span className="font-medium text-cyan-300">
                  {countdown || "Ready"}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {/* TIER BADGE */}
              <div
                className={`px-3 py-2 rounded-xl text-[10px] flex flex-col items-end justify-center shadow-[0_0_24px_rgba(15,23,42,0.9)] ${tier.badgeClass}`}
              >
                <span className="uppercase tracking-[0.16em] text-[9px] text-slate-200/80">
                  {accountRank}
                </span>
                <span className={`mt-[2px] font-semibold ${tier.colorClass}`}>
                  {tier.name}
                </span>
              </div>

              {/* BUY EXTRA BUTTON */}
              <button
                onClick={() => setShowBuyModal(true)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-baseBlue hover:bg-baseBlue/90 text-[11px] font-semibold shadow-[0_0_26px_rgba(37,99,235,0.85)] transition-transform active:scale-95"
              >
                <span className="text-[13px]">＋</span>
                <span>Buy extra</span>
              </button>
            </div>
          </div>
        </section>

        {/* INFO / NO PICKS MESSAGE */}
        {!canPick && (
          <div className="mb-3 text-[11px] text-amber-100 bg-gradient-to-r from-amber-900/60 via-amber-900/40 to-amber-800/40 border border-amber-500/60 rounded-2xl px-3 py-2 shadow-[0_0_18px_rgba(245,158,11,0.55)]">
            <div className="font-semibold mb-1 text-[11px]">
              No boxes left to open
            </div>
            <p className="leading-snug">
              Wait until the timer hits{" "}
              <span className="font-semibold">Ready</span> or buy extra
              picks to keep opening today.
            </p>
          </div>
        )}

        {/* BOX GRID */}
        <section className="relative bg-gradient-to-b from-slate-950/90 to-black/80 border border-slate-900 rounded-3xl px-4 py-4 mb-4 overflow-hidden">
          <div className="absolute inset-x-0 -top-20 h-32 bg-[radial-gradient(circle_at_50%_0,#1d4ed855_0,transparent_60%)] opacity-70" />
          <div className="relative">
            <div className="flex items-baseline justify-between mb-1.5">
              <h2 className="text-sm font-semibold tracking-tight">
                Pick your box
              </h2>
              <span className="text-[10px] text-slate-400">
                One pick = one opening
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4 mt-2">
              {[0, 1, 2].map((index) => (
                <button
                  key={index}
                  onClick={() => handlePick(index)}
                  disabled={!canPick || picking}
                  className={`relative aspect-[4/5] rounded-2xl flex items-center justify-center border shadow-[0_12px_30px_rgba(15,23,42,0.9)] transition-transform duration-200 ease-out
                  ${
                    !canPick || picking
                      ? "border-slate-800 bg-slate-950/70 text-slate-600 cursor-not-allowed"
                      : "border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-950 to-black hover:-translate-y-1 hover:border-cyan-400/70 hover:shadow-[0_18px_40px_rgba(8,47,73,0.9)]"
                  }`}
                >
                  <div className="relative">
                    <span className="text-4xl block drop-shadow-[0_6px_10px_rgba(0,0,0,0.8)]">
                      📦
                    </span>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-10 h-2 bg-cyan-400/30 blur-md" />
                  </div>
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
              className={`w-full py-2.5 rounded-2xl text-sm font-semibold transition-transform duration-150 shadow-[0_16px_40px_rgba(37,99,235,0.75)]
              ${
                picking
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed shadow-none"
                  : canPick
                  ? "bg-baseBlue hover:bg-baseBlue/90 active:translate-y-[1px]"
                  : "bg-emerald-500 hover:bg-emerald-400 active:translate-y-[1px]"
              }`}
            >
              {picking
                ? "Opening…"
                : canPick
                ? "Random open"
                : "Buy extra"}
            </button>
          </div>
        </section>

        {/* NAV BUTTONS */}
        <section className="flex gap-2">
          <Link
            href="/leaderboard"
            className="flex-1 text-center text-xs py-2.5 rounded-2xl border border-slate-800 bg-slate-950/80 hover:bg-slate-900 transition shadow-[0_10px_24px_rgba(15,23,42,0.9)]"
          >
            Leaderboard
          </Link>
          <Link
            href="/faq"
            className="flex-1 text-center text-xs py-2.5 rounded-2xl border border-slate-800 bg-slate-950/80 hover:bg-slate-900 transition shadow-[0_10px_24px_rgba(15,23,42,0.9)]"
          >
            FAQ
          </Link>
        </section>
      </div>

      {/* RESULT MODAL */}
      {showResultModal && lastResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-slate-950 border border-slate-800 rounded-3xl px-4 py-4 relative shadow-[0_24px_60px_rgba(0,0,0,0.9)]">
            <button
              onClick={() => setShowResultModal(false)}
              className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 text-sm"
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
              <p className="text-lg font-bold text-cyan-300 mb-1">
                Reward: +{lastResult.points} points
              </p>
              <p className="text-[11px] text-slate-400 mb-4">
                Keep opening boxes to climb the leaderboard.
              </p>
              <button
                onClick={handleShareResult}
                className="w-full py-2 rounded-2xl bg-baseBlue hover:bg-baseBlue/90 text-xs font-semibold mb-2 shadow-[0_14px_32px_rgba(37,99,235,0.8)]"
              >
                Share on Farcaster
              </button>
              <button
                onClick={() => setShowResultModal(false)}
                className="w-full py-2 rounded-2xl border border-slate-700 text-xs text-slate-200 hover:bg-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BUY MODAL */}
      {showBuyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-slate-950 border border-slate-800 rounded-3xl px-4 py-4 relative shadow-[0_24px_60px_rgba(0,0,0,0.9)]">
            <button
              onClick={() => {
                setShowBuyModal(false);
                setBuyError(null);
              }}
              className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 text-sm"
            >
              ✕
            </button>

            <div className="text-center mt-1 mb-3">
              <h3 className="text-sm font-semibold mb-1">
                Buy extra picks
              </h3>
              <p className="text-[11px] text-slate-400">
                Pay with Base USDC via Neynar Pay. Picks don&apos;t expire
                and can be used on any day.
              </p>
            </div>

            <div className="space-y-2 mb-3">
              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(1)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-2xl border border-slate-700 bg-slate-950 hover:bg-slate-900 text-xs"
              >
                <span>+1 extra pick</span>
                <span className="text-slate-200">
                  {process.env.NEXT_PUBLIC_BBOX_PRICE_1 ?? "0.5 USDC"}
                </span>
              </button>
              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(5)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-2xl border border-slate-700 bg-slate-950 hover:bg-slate-900 text-xs"
              >
                <span>+5 extra picks</span>
                <span className="text-slate-200">
                  {process.env.NEXT_PUBLIC_BBOX_PRICE_5 ?? "2.0 USDC"}
                </span>
              </button>
              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(10)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-2xl border border-slate-700 bg-slate-950 hover:bg-slate-900 text-xs"
              >
                <span>+10 extra picks</span>
                <span className="text-slate-200">
                  {process.env.NEXT_PUBLIC_BBOX_PRICE_10 ?? "3.5 USDC"}
                </span>
              </button>
            </div>

            <div className="border-t border-slate-800 pt-3 mt-2">
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
              <p className="mt-2 text-[11px] text-slate-400 text-center">
                Opening Neynar Pay…
              </p>
            )}
          </div>
        </div>
      )}

      {/* OG MODAL */}
      {showOgModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-slate-950 border border-slate-800 rounded-3xl px-4 py-4 relative shadow-[0_24px_60px_rgba(0,0,0,0.9)]">
            <button
              onClick={() => {
                setShowOgModal(false);
                setBuyError(null);
              }}
              className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 text-sm"
            >
              ✕
            </button>

            <div className="mt-1 mb-3 text-center">
              <h3 className="text-sm font-semibold mb-1">
                Become OG
              </h3>
              <p className="text-[11px] text-slate-400">
                One-time purchase, FID-bound. OGs get a permanent daily
                buff and a unique badge in BBOX.
              </p>
            </div>

            <button
              disabled={buyLoading}
              onClick={handleBuyOg}
              className="w-full py-2 rounded-2xl bg-purple-700 hover:bg-purple-600 text-xs font-semibold mb-2 shadow-[0_16px_38px_rgba(126,34,206,0.8)]"
            >
              Become OG (
              {process.env.NEXT_PUBLIC_BBOX_OG_PRICE ?? "5.0"} USDC)
            </button>

            <button
              onClick={() => setShowOgModal(false)}
              className="w-full py-2 rounded-2xl border border-slate-700 text-xs text-slate-200 hover:bg-slate-900"
            >
              Maybe later
            </button>

            {buyError && (
              <p className="mt-3 text-[11px] text-red-400 text-center">
                {buyError}
              </p>
            )}

            {buyLoading && (
              <p className="mt-2 text-[11px] text-slate-400 text-center">
                Opening Neynar Pay…
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
