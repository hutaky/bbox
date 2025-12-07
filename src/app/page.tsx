// src/app/page.tsx
"use client";

const BBOX_URL = "https://box-sage.vercel.app"; // IDE a saját deploy URL-ed

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

// Liga meghatározása pontszám alapján
function getLeagueFromPoints(points: number): string {
  if (points >= 30000) return "Platinum League";
  if (points >= 20000) return "Gold League";
  if (points >= 10000) return "Silver League";
  return "Bronze League";
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
  async function loadUserState(
    currentFid: number | null,
    profile?: { username?: string | null; pfpUrl?: string | null }
  ) {
    if (!currentFid) return;
    try {
      const res = await fetch("/api/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: currentFid,
          username: profile?.username ?? null,
          pfpUrl: profile?.pfpUrl ?? null,
        }),
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
      } catch (e) {
        console.warn("sdk.actions.ready() failed on main page:", e);
      }

      try {
        const context: any = await sdk.context;

        // A Farcaster user több helyen is jöhet – mindet próbáljuk:
        const ctxUser =
          context?.user ??
          context?.viewer ??
          context?.viewerContext?.user ??
          null;

        const ctxFid: number | null =
          ctxUser?.fid ??
          context?.frameData?.fid ??
          null;

        const profile = {
          username:
            ctxUser?.username ??
            ctxUser?.displayName ??
            ctxUser?.display_name ??
            ctxUser?.name ??
            null,
          pfpUrl:
            ctxUser?.pfpUrl ??
            ctxUser?.pfp_url ??
            ctxUser?.pfp?.url ??
            null,
        };

        const queryFid = getFidFromQuery();
        const finalFid = ctxFid || queryFid;

        if (!cancelled) {
          setFid(finalFid);
          await loadUserState(finalFid, profile);
        }
      } catch (e) {
        console.error("Error initializing mini app SDK (context):", e);
        const queryFid = getFidFromQuery();
        if (!cancelled) {
          setFid(queryFid);
          await loadUserState(queryFid, undefined);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (typeof window !== "undefined") {
      void init();
    } else {
      setLoading(false);
    }

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
  const text = `I just opened a ${rarityLabel} box on BBOX and earned +${lastResult.points} points! 🎁`;

  // szöveg + direkt link az apphoz
  const fullText = `${text}\n\nPlay BBOX here: ${BBOX_URL}`;

  // Farcaster compose URL – az embeds[] param miatt a frame linkként is bekerül
  const composeUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(
    fullText
  )}&embeds[]=${encodeURIComponent(BBOX_URL)}`;

  try {
    await sdk.actions.openUrl(composeUrl);
  } catch (e) {
    console.error("Share failed:", e);
    alert("Could not open share dialog.");
  }
}


  // ---- Neynar Pay: extra picks (egyelőre letiltott backendgel) ----
  async function handleBuyExtra(packSize: 1 | 5 | 10) {
    if (!fid) {
      alert("Missing FID, please open from Farcaster.");
      return;
    }
    try {
      setBuyLoading(true);
      setBuyError(null);

      const res = await fetch("/api/buy/extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid, packSize }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Failed to create pay frame:", data);
        setBuyError(
          data.error ?? "Purchases are currently disabled. Try again later."
        );
        return;
      }

      // Ha később újra bekötjük, itt nyitjuk meg a fizetési framet.
    } catch (err) {
      console.error("Error in handleBuyExtra:", err);
      setBuyError("Something went wrong, try again.");
    } finally {
      setBuyLoading(false);
    }
  }

  // ---- Neynar Pay: OG rank (egyelőre letiltott backendgel) ----
  async function handleBuyOg() {
    if (!fid) {
      alert("Missing FID, please open from Farcaster.");
      return;
    }
    try {
      setBuyLoading(true);
      setBuyError(null);

      const res = await fetch("/api/buy/og", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Failed to create OG pay frame:", data);
        setBuyError(
          data.error ?? "OG upgrades are currently disabled. Try again later."
        );
        return;
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

  const displayName =
    user?.username ||
    (fid ? `fid:${fid}` : "Guest");

  const league = getLeagueFromPoints(user?.totalPoints ?? 0);
  const rankLabel = user?.isOg
    ? user?.isPro
      ? "BOX PRO OG"
      : "BOX OG"
    : user?.isPro
    ? "BOX PRO"
    : "BOX Based";

  if (loading) {
    return (
      <main className="min-h-screen bg-[#02010A] text-white flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-spin h-8 w-8 border-2 border-[#00C2FF] border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-400">Loading BBOX…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#02010A] via-[#050315] to-black text-white">
      <div className="max-w-md mx-auto px-4 pb-6 pt-4">
        {/* HEADER */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <img
              src="/icon.png"
              alt="BBOX logo"
              className="w-9 h-9 rounded-xl border border-[#00C2FF]/40 shadow-[0_0_18px_rgba(0,194,255,0.6)] bg-black/60"
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                <span>BBOX</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 border border-emerald-400/60 text-emerald-200">
                  Daily Box
                </span>
              </h1>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                <span>Daily Based Box game</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user?.pfpUrl ? (
              <img
                src={user.pfpUrl}
                alt={displayName}
                className="w-9 h-9 rounded-full border border-[#00C2FF]/40 shadow-[0_0_18px_rgba(0,194,255,0.6)] object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full border border-[#00C2FF]/40 bg-gradient-to-br from-[#16162A] to-[#050315] flex items-center justify-center shadow-[0_0_18px_rgba(0,194,255,0.4)] text-sm font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="text-right">
              <div className="text-sm font-medium truncate max-w-[120px]">
                {displayName}
              </div>
              <div className="text-[11px] text-[#F4F0FF]/80">
                {rankLabel}
              </div>
            </div>
          </div>
        </header>

        {/* STATS CARD */}
        <section className="relative bg-gradient-to-br from-[#070B2A] via-[#050315] to-black border border-[#1C2348] rounded-3xl px-4 py-4 mb-4 shadow-[0_0_40px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="absolute -left-24 -bottom-24 w-52 h-52 rounded-full bg-[#00C2FF]/10 blur-3xl pointer-events-none" />
          <div className="absolute -right-20 -top-24 w-52 h-52 rounded-full bg-[#7C3AED]/15 blur-3xl pointer-events-none" />

          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="flex-1">
              <div className="flex justify-between text-[11px] text-[#A6B0FF]/80">
                <span className="tracking-[0.18em]">
                  TOTAL POINTS
                </span>
                <span className="font-semibold text-[13px] text-[#E6EBFF]">
                  {user?.totalPoints ?? 0}
                </span>
              </div>
              <div className="flex justify-between text-xs text-[#B0BBFF]/80 mt-2">
                <span>Extra picks</span>
                <span className="font-medium text-emerald-300">
                  {user?.extraPicksRemaining ?? 0}
                </span>
              </div>
              <div className="flex justify-between text-xs text-[#B0BBFF]/80 mt-1">
                <span>Free picks</span>
                <span className="font-medium text-sky-300">
                  {user?.freePicksRemaining ?? 0}
                </span>
              </div>
              <div className="text-[11px] mt-2 flex items-center justify-between text-[#A6B0FF]/80">
                <span>Next free box:</span>
                <span className="font-semibold text-emerald-300">
                  {countdown || "Ready"}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {/* Tier card */}
              <div className="px-3 py-2 rounded-2xl bg-gradient-to-br from-[#14162F] via-[#191B3D] to-[#050315] border border-[#2B3170] shadow-[0_0_20px_rgba(124,58,237,0.3)] min-w-[120px]">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#9CA3FF]/90 mb-1">
                  {rankLabel}
                </div>
                <div className="text-xs font-semibold text-[#F4F0FF]">
                  {league}
                </div>
              </div>

              {/* Buy extra button */}
              <button
                onClick={() => setShowBuyModal(true)}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-2xl bg-gradient-to-r from-[#2563EB] via-[#00C2FF] to-[#22C55E] text-xs font-semibold shadow-[0_0_24px_rgba(37,99,235,0.8)] hover:brightness-110 transition"
              >
                <span className="text-[12px]">+ Buy extra</span>
              </button>
            </div>
          </div>
        </section>

        {/* INFO / NO PICKS MESSAGE */}
        {!canPick && (
          <div className="mb-3 text-xs text-amber-200 bg-gradient-to-r from-amber-600/40 via-amber-500/20 to-amber-900/40 border border-amber-400/70 rounded-2xl px-3 py-2 shadow-[0_0_18px_rgba(251,191,36,0.55)]">
            <div className="font-semibold mb-1">
              No boxes left to open
            </div>
            <p className="text-[11px]">
              Wait until the timer hits{" "}
              <span className="font-semibold">Ready</span> or buy
              extra picks to keep opening today.
            </p>
          </div>
        )}

        {/* BOX GRID */}
        <section className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl px-4 py-4 mb-4 shadow-[0_0_30px_rgba(0,0,0,0.85)]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">Pick your box</h2>
            <span className="text-[11px] text-gray-400">
              One pick = one opening
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => handlePick(index)}
                disabled={!canPick || picking}
                className={`relative aspect-square rounded-2xl flex items-center justify-center border text-3xl transition transform active:scale-95 overflow-hidden
                  ${
                    !canPick || picking
                      ? "border-zinc-700 bg-gradient-to-br from-[#050315] to-[#0B0B1A] text-zinc-600 cursor-not-allowed"
                      : "border-[#2735A8] bg-gradient-to-br from-[#0B102F] via-[#050315] to-[#02010A] hover:from-[#111A4D]"
                  }`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(0,194,255,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(124,58,237,0.25),transparent_55%)] pointer-events-none" />
                <span className="relative text-[34px]">
                  📦
                </span>
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
            className={`w-full py-2.5 rounded-2xl text-sm font-semibold transition shadow-[0_0_26px_rgba(56,189,248,0.65)]
              ${
                picking
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none"
                  : canPick
                  ? "bg-gradient-to-r from-[#38BDF8] via-[#00C2FF] to-[#22C55E] text-black"
                  : "bg-gradient-to-r from-emerald-500 to-[#00C2FF] text-black"
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
            className="flex-1 text-center text-xs py-2 rounded-2xl border border-[#151836] bg-gradient-to-r from-[#050315] to-[#05081F] hover:from-[#070921] hover:to-[#0B102F] transition shadow-[0_0_18px_rgba(0,0,0,0.6)]"
          >
            Leaderboard
          </Link>
          <Link
            href="/faq"
            className="flex-1 text-center text-xs py-2 rounded-2xl border border-[#151836] bg-gradient-to-r from-[#050315] to-[#05081F] hover:from-[#070921] hover:to-[#0B102F] transition shadow-[0_0_18px_rgba(0,0,0,0.6)]"
          >
            FAQ
          </Link>
        </section>
      </div>

      {/* RESULT MODAL */}
      {showResultModal && lastResult && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-[#050315] border border-[#1F2937] rounded-2xl px-4 py-4 relative shadow-[0_0_32px_rgba(0,0,0,0.9)]">
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
              <p className="text-lg font-bold text-[#00C2FF] mb-1">
                Reward: +{lastResult.points} points
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Keep opening boxes to climb the leaderboard.
              </p>
              <button
                onClick={handleShareResult}
                className="w-full py-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#00C2FF] hover:brightness-110 text-xs font-semibold mb-2"
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
          <div className="w-full max-w-xs bg-[#050315] border border-[#1F2937] rounded-2xl px-4 py-4 relative shadow-[0_0_32px_rgba(0,0,0,0.9)]">
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
              <h3 className="text-sm font-semibold mb-1">
                Buy extra picks
              </h3>
              <p className="text-[11px] text-gray-400">
                Picks don&apos;t expire and can be used on any day.
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
                Opening payment flow…
              </p>
            )}
          </div>
        </div>
      )}

      {/* OG MODAL */}
      {showOgModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-[#050315] border border-[#1F2937] rounded-2xl px-4 py-4 relative shadow-[0_0_32px_rgba(0,0,0,0.9)]">
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
                One-time purchase, FID-bound. OGs get a permanent daily
                buff and a unique badge in BBOX.
              </p>
            </div>

            <button
              disabled={buyLoading}
              onClick={handleBuyOg}
              className="w-full py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-xs font-semibold mb-2"
            >
              Become OG ({process.env.NEXT_PUBLIC_BBOX_OG_PRICE ?? "5.0"}{" "}
              USDC)
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
                Opening payment flow…
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
