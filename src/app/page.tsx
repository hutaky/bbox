// src/app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sdk } from "@farcaster/miniapp-sdk";
import type { ApiUserState } from "@/types";

const BBOX_URL = "https://box-sage.vercel.app";

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

function getLeagueFromPoints(points: number): string {
  if (points >= 30000) return "Platinum League";
  if (points >= 20000) return "Gold League";
  if (points >= 10000) return "Silver League";
  return "Bronze League";
}

function buildPayDebugMessage(fallback: string, data: any): string {
  const base = data?.error ?? fallback;
  const parts: string[] = [];
  if (data?.hint) parts.push(`hint: ${data.hint}`);
  if (data?.details) {
    try {
      parts.push(`details: ${JSON.stringify(data.details, null, 2)}`);
    } catch {
      parts.push(`details: ${String(data.details)}`);
    }
  }
  if (data?.sdkDebug) parts.push(`sdkDebug: ${data.sdkDebug}`);
  return `${base}\n\n[debug]\n${parts.join("\n")}`.trim();
}

function extractSendTokenError(result: any): string {
  const reason = typeof result?.reason === "string" ? result.reason : "unknown";
  const message =
    result?.error?.message ??
    result?.message ??
    (typeof result === "string" ? result : "");
  const combined = `${reason} ${message}`.trim();
  return combined || "unknown";
}

function isWrongAmountLike(settleData: any): boolean {
  const err = String(settleData?.error ?? "").toLowerCase();
  if (err.includes("wrong amount")) return true;

  // extra safety: ha az expected/actual mezők benne vannak, az is erre utal
  const detailsStr = (() => {
    try {
      return JSON.stringify(settleData?.details ?? {});
    } catch {
      return "";
    }
  })().toLowerCase();

  return detailsStr.includes("expected") && detailsStr.includes("actual");
}

function donationMessage(packLabel: string) {
  return [
    `Thanks for supporting BBOX 💙`,
    ``,
    `We received your payment, but the amount didn’t match the selected pack (${packLabel}).`,
    `No picks were added.`,
    ``,
    `If you change the amount in the wallet screen, the transfer is treated as a donation.`,
  ].join("\n");
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

  // ERROR (piros debug)
  const [buyError, setBuyError] = useState<string | null>(null);

  // INFO (brand / donation üzenet)
  const [buyInfo, setBuyInfo] = useState<string | null>(null);

  const mountedRef = useRef(true);

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
      if (!mountedRef.current) return;

      setUser(data);

      if (data?.nextFreePickAt) setCountdown(formatCountdown(data.nextFreePickAt));
      else setCountdown("Ready");

      if (data?.lastResult) setLastResult(data.lastResult);
    } catch (err) {
      console.error("Failed to load user state:", err);
    }
  }

  // ---- Mini App init ----
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function init() {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("sdk.actions.ready() failed:", e);
      }

      try {
        const context: any = await (sdk as any).context;

        const ctxUser =
          context?.user ??
          context?.viewer ??
          context?.viewerContext?.user ??
          context?.frameData?.user ??
          null;

        const ctxFid: number | null = ctxUser?.fid ?? context?.frameData?.fid ?? null;

        const profile = {
          username:
            ctxUser?.username ??
            ctxUser?.displayName ??
            ctxUser?.display_name ??
            ctxUser?.name ??
            null,
          pfpUrl: ctxUser?.pfpUrl ?? ctxUser?.pfp_url ?? ctxUser?.pfp?.url ?? null,
        };

        const queryFid = getFidFromQuery();
        const finalFid = ctxFid || queryFid;

        if (!cancelled) {
          setFid(finalFid);
          await loadUserState(finalFid, profile);
        }
      } catch (e) {
        console.error("Error reading sdk.context:", e);
        const queryFid = getFidFromQuery();
        if (!cancelled) {
          setFid(queryFid);
          await loadUserState(queryFid, undefined);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, []);

  // ---- Countdown ----
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
    (user?.freePicksRemaining ?? 0) > 0 || (user?.extraPicksRemaining ?? 0) > 0;

  // ---- Pick ----
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

  // ---- Share ----
  async function handleShareResult() {
    if (!lastResult) return;

    const rarityLabel = lastResult.rarity.toLowerCase();
    const fullText = `I just opened a ${rarityLabel} box on BBOX and earned +${lastResult.points} points! 🎁\n\nPlay BBOX here: ${BBOX_URL}`;

    const composeUrl = `https://farcaster.com/~/compose?text=${encodeURIComponent(
      fullText
    )}&embeds[]=${encodeURIComponent(BBOX_URL)}`;

    try {
      await sdk.actions.openUrl(composeUrl);
    } catch (e) {
      console.error("Share failed:", e);
      alert("Could not open share dialog.");
    }
  }

  function packLabel(packSize: 1 | 5 | 10) {
    return `+${packSize} extra picks`;
  }

  /**
   * NATÍV fizetés Mini App SDK-val:
   * - backend visszaadja: paymentId + token (CAIP-19), amount (base units), recipientAddress
   * - sdk.actions.sendToken(...)
   * - tx hash -> /api/pay/settle (paymentId + txHash)
   */
  async function handleBuyExtra(packSize: 1 | 5 | 10) {
    if (!fid) {
      alert("Missing FID, please open from Farcaster.");
      return;
    }

    try {
      setBuyLoading(true);
      setBuyError(null);
      setBuyInfo(null);

      const res = await fetch("/api/pay/extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid, packSize }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBuyError(buildPayDebugMessage("Failed to prepare payment.", data));
        setBuyLoading(false);
        return;
      }

      const paymentId = data?.paymentId as string | undefined;
      const token = data?.token as string | undefined;
      const amount = data?.amount as string | undefined;
      const recipientAddress = data?.recipientAddress as string | undefined;

      if (!paymentId || !token || !amount || !recipientAddress) {
        setBuyError(buildPayDebugMessage("Invalid payment payload from server.", data));
        setBuyLoading(false);
        return;
      }

      const result: any = await sdk.actions.sendToken({
        token,
        amount,
        recipientAddress,
      });

      if (!result?.success) {
        setBuyError(
          buildPayDebugMessage("Transaction cancelled or failed.", {
            error: "Transaction cancelled or failed.",
            sdkDebug: extractSendTokenError(result),
            details: result,
          })
        );
        setBuyLoading(false);
        return;
      }

      const txHash =
        result?.send?.transaction ??
        result?.transaction ??
        result?.txHash ??
        null;

      if (!txHash || typeof txHash !== "string") {
        setBuyError(
          buildPayDebugMessage("Payment confirmed, but missing tx hash from wallet.", {
            error: "Missing tx hash from sendToken result.",
            details: result,
          })
        );
        setBuyLoading(false);
        return;
      }

      const settleRes = await fetch("/api/pay/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, txHash }),
        cache: "no-store",
      });

      const settleData = await settleRes.json().catch(() => ({}));
      if (!settleRes.ok) {
        // BRAND-építés: ha wrong amount, ne bugként jelenjen meg
        if (isWrongAmountLike(settleData)) {
          setBuyInfo(donationMessage(packLabel(packSize)));
          setBuyError(null);
          setBuyLoading(false);
          return;
        }

        setBuyError(buildPayDebugMessage("Payment sent, but verification failed.", settleData));
        setBuyLoading(false);
        return;
      }

      await loadUserState(fid, {
        username: user?.username ?? null,
        pfpUrl: user?.pfpUrl ?? null,
      });

      setBuyLoading(false);
      setBuyError(null);
      setBuyInfo(null);
      setShowBuyModal(false);
    } catch (err: any) {
      console.error("handleBuyExtra error:", err);
      setBuyError(buildPayDebugMessage("Something went wrong.", { error: String(err?.message ?? err) }));
      setBuyLoading(false);
    }
  }

  async function handleBuyOg() {
    if (!fid) {
      alert("Missing FID, please open from Farcaster.");
      return;
    }

    try {
      setBuyLoading(true);
      setBuyError(null);
      setBuyInfo(null);

      const res = await fetch("/api/pay/og", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fid }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBuyError(buildPayDebugMessage("Failed to prepare OG payment.", data));
        setBuyLoading(false);
        return;
      }

      const paymentId = data?.paymentId as string | undefined;
      const token = data?.token as string | undefined;
      const amount = data?.amount as string | undefined;
      const recipientAddress = data?.recipientAddress as string | undefined;

      if (!paymentId || !token || !amount || !recipientAddress) {
        setBuyError(buildPayDebugMessage("Invalid OG payment payload from server.", data));
        setBuyLoading(false);
        return;
      }

      const result: any = await sdk.actions.sendToken({
        token,
        amount,
        recipientAddress,
      });

      if (!result?.success) {
        setBuyError(
          buildPayDebugMessage("Transaction cancelled or failed.", {
            error: "Transaction cancelled or failed.",
            sdkDebug: extractSendTokenError(result),
            details: result,
          })
        );
        setBuyLoading(false);
        return;
      }

      const txHash =
        result?.send?.transaction ??
        result?.transaction ??
        result?.txHash ??
        null;

      if (!txHash || typeof txHash !== "string") {
        setBuyError(
          buildPayDebugMessage("Payment confirmed, but missing tx hash from wallet.", {
            error: "Missing tx hash from sendToken result.",
            details: result,
          })
        );
        setBuyLoading(false);
        return;
      }

      const settleRes = await fetch("/api/pay/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, txHash }),
        cache: "no-store",
      });

      const settleData = await settleRes.json().catch(() => ({}));
      if (!settleRes.ok) {
        // OG-nál is lehet mismatch (ha átírja az összeget) -> donation message
        if (isWrongAmountLike(settleData)) {
          setBuyInfo(
            [
              "Thanks for supporting BBOX 💙",
              "",
              "We received your payment, but the amount didn’t match the OG purchase price.",
              "OG status was not activated.",
              "",
              "If you change the amount in the wallet screen, the transfer is treated as a donation.",
            ].join("\n")
          );
          setBuyError(null);
          setBuyLoading(false);
          return;
        }

        setBuyError(buildPayDebugMessage("Payment sent, but verification failed.", settleData));
        setBuyLoading(false);
        return;
      }

      await loadUserState(fid, {
        username: user?.username ?? null,
        pfpUrl: user?.pfpUrl ?? null,
      });

      setBuyLoading(false);
      setBuyError(null);
      setBuyInfo(null);
      setShowOgModal(false);
    } catch (err: any) {
      console.error("handleBuyOg error:", err);
      setBuyError(buildPayDebugMessage("Something went wrong.", { error: String(err?.message ?? err) }));
      setBuyLoading(false);
    }
  }

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
    const baseClass = "px-2 py-1 rounded-full text-xs font-semibold border";
    switch (rarity) {
      case "COMMON":
        return <span className={`${baseClass} border-gray-500 text-gray-200`}>COMMON</span>;
      case "RARE":
        return <span className={`${baseClass} border-rare text-rare`}>RARE</span>;
      case "EPIC":
        return <span className={`${baseClass} border-epic text-epic`}>EPIC</span>;
      case "LEGENDARY":
        return <span className={`${baseClass} border-legendary text-legendary`}>LEGENDARY</span>;
    }
  }

  const displayName = user?.username || (fid ? `fid:${fid}` : "Guest");
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
                  Season 0
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
              <div className="text-sm font-medium truncate max-w-[120px]">{displayName}</div>
              <div className="text-[11px] text-[#F4F0FF]/80">{rankLabel}</div>
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
                <span className="tracking-[0.18em]">TOTAL POINTS:</span>
                <span className="font-semibold text-[13px] text-[#E6EBFF]">{user?.totalPoints ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs text-[#B0BBFF]/80 mt-2">
                <span>Extra picks:</span>
                <span className="font-medium text-emerald-300">{user?.extraPicksRemaining ?? 0}</span>
              </div>
              <div className="flex justify-between text-xs text-[#B0BBFF]/80 mt-1">
                <span>Free picks:</span>
                <span className="font-medium text-sky-300">{user?.freePicksRemaining ?? 0}</span>
              </div>
              <div className="text-[11px] mt-2 flex items-center justify-between text-[#A6B0FF]/80">
                <span>Next free box:</span>
                <span className="font-semibold text-emerald-300">{countdown || "Ready"}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="px-3 py-2 rounded-2xl bg-gradient-to-br from-[#14162F] via-[#191B3D] to-[#050315] border border-[#2B3170] shadow-[0_0_20px_rgba(124,58,237,0.3)] min-w-[120px]">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#9CA3FF]/90 mb-1">{rankLabel}</div>
                <div className="text-xs font-semibold text-[#F4F0FF]">{league}</div>
              </div>

              <button
                onClick={() => {
                  setBuyError(null);
                  setBuyInfo(null);
                  setShowBuyModal(true);
                }}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-2xl bg-gradient-to-r from-[#2563EB] via-[#00C2FF] to-[#22C55E] text-xs font-semibold shadow-[0_0_24px_rgba(37,99,235,0.8)] hover:brightness-110 transition"
              >
                <span className="text-[12px]">+ Buy extra</span>
              </button>
            </div>
          </div>
        </section>

        {!canPick && (
          <div className="mb-3 text-xs text-amber-200 bg-gradient-to-r from-amber-600/40 via-amber-500/20 to-amber-900/40 border border-amber-400/70 rounded-2xl px-3 py-2 shadow-[0_0_18px_rgba(251,191,36,0.55)]">
            <div className="font-semibold mb-1">No boxes left to open</div>
            <p className="text-[11px]">
              Wait until the timer hits <span className="font-semibold">Ready</span> or buy extra picks to keep opening today.
            </p>
          </div>
        )}

        {/* BOX GRID */}
        <section className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl px-4 py-4 mb-4 shadow-[0_0_30px_rgba(0,0,0,0.85)]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">Pick your box</h2>
            <span className="text-[11px] text-gray-400">One pick = one opening</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => handlePick(index)}
                disabled={!canPick || picking}
                className={`group relative aspect-square rounded-2xl overflow-hidden border transition-all duration-300
                  ${
                    !canPick || picking
                      ? "border-zinc-700 bg-gradient-to-br from-[#050315] to-[#0B0B1A] cursor-not-allowed opacity-60"
                      : "border-[#2735A8] bg-gradient-to-br from-[#0B102F] via-[#050315] to-[#02010A] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]"
                  }`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#00C2FF]/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 translate-x-[-120%] skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent group-hover:translate-x-[120%] transition-transform duration-700 ease-out" />
                <div className="relative z-10 h-full flex items-center justify-center">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#00C2FF]/80 to-[#00C2FF]/40 flex items-center justify-center shadow-[0_0_30px_rgba(0,194,255,0.35)] border border-white/20">
                    <svg viewBox="0 0 24 24" className="w-8 h-8 text-white/90" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <path d="M3.3 7L12 12l8.7-5" />
                      <path d="M12 22V12" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur px-2 py-1 text-center">
                  <span className="text-[11px] text-gray-300 group-hover:text-white transition">Tap to open</span>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => (canPick ? handlePick(Math.floor(Math.random() * 3)) : setShowBuyModal(true))}
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
            {picking ? "Opening..." : canPick ? "Random open" : "Buy extra"}
          </button>
        </section>

        {/* NAV */}
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

      {/* BUY MODAL */}
      {showBuyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-[#050315] border border-[#1F2937] rounded-2xl px-4 py-4 relative shadow-[0_0_32px_rgba(0,0,0,0.9)]">
            <button
              onClick={() => {
                setShowBuyModal(false);
                setBuyError(null);
                setBuyInfo(null);
              }}
              className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 text-sm"
            >
              ✕
            </button>

            <div className="text-center mt-1 mb-3">
              <h3 className="text-sm font-semibold mb-1">Buy extra picks</h3>
              <p className="text-[11px] text-gray-400">
                This opens a native Farcaster wallet confirmation (no new tab).
              </p>
            </div>

            <div className="space-y-2 mb-3">
              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(1)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                <span>+1 extra pick</span>
                <span className="text-gray-300">{process.env.NEXT_PUBLIC_BBOX_EXTRA_PRICE_1 ?? "0.5"} USDC</span>
              </button>

              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(5)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                <span>+5 extra picks</span>
                <span className="text-gray-300">{process.env.NEXT_PUBLIC_BBOX_EXTRA_PRICE_5 ?? "2.0"} USDC</span>
              </button>

              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(10)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                <span>+10 extra picks</span>
                <span className="text-gray-300">{process.env.NEXT_PUBLIC_BBOX_EXTRA_PRICE_10 ?? "3.5"} USDC</span>
              </button>
            </div>

            {/* NEW: donation warning (brand friendly) */}
            <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200/90 leading-snug">
              <div className="font-semibold text-sky-200">Important</div>
              Please do <span className="font-semibold">not</span> change the amount in the wallet screen. Only the exact price unlocks the selected pack.
              <div className="mt-1 text-sky-200/80">
                If you change the amount, the transfer is treated as a donation — thank you for supporting BBOX 💙
              </div>
            </div>

            <div className="border-t border-zinc-800 pt-3 mt-3">
              <button
                disabled={buyLoading}
                onClick={() => {
                  setShowBuyModal(false);
                  setShowOgModal(true);
                  setBuyError(null);
                  setBuyInfo(null);
                }}
                className="w-full text-[11px] text-purple-300 hover:text-purple-200 underline decoration-dotted"
              >
                Become an OG box opener
              </button>
            </div>

            {/* BRAND INFO BOX (donation / mismatch) */}
            {buyInfo && (
              <div className="mt-3 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200/90">
                <pre className="whitespace-pre-wrap break-words text-center font-mono">{buyInfo}</pre>
              </div>
            )}

            {/* DEBUG ERROR (only for real failures) */}
            {buyError && (
              <div className="mt-3 text-[11px] text-red-300">
                <pre className="whitespace-pre-wrap break-words text-center font-mono">{buyError}</pre>
              </div>
            )}

            {buyLoading && (
              <p className="mt-2 text-[11px] text-gray-400 text-center">Waiting for confirmation…</p>
            )}
          </div>
        </div>
      )}

      {/* OG MODAL (unchanged UI, but supports donation-style message too) */}
      {showOgModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-[#050315] border border-[#1F2937] rounded-2xl px-4 py-4 relative shadow-[0_0_32px_rgba(0,0,0,0.9)]">
            <button
              onClick={() => {
                setShowOgModal(false);
                setBuyError(null);
                setBuyInfo(null);
              }}
              className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 text-sm"
            >
              ✕
            </button>

            <div className="mt-1 mb-3">
              <h3 className="text-sm font-semibold mb-1 text-center">Become OG</h3>
              <p className="text-[11px] text-gray-400 text-center">
                One-time purchase, FID-bound. OGs get a permanent daily buff and a unique badge in BBOX.
              </p>
            </div>

<button
  disabled={buyLoading || Boolean(user?.isOg)}
  onClick={() => {
    if (!user?.isOg) handleBuyOg();
  }}
  className={`w-full py-2 rounded-xl text-xs font-semibold mb-2 transition
    ${
      buyLoading || user?.isOg
        ? "bg-zinc-800 text-zinc-400 cursor-not-allowed"
        : "bg-purple-700 hover:bg-purple-600 text-white"
    }`}
>
  {user?.isOg
    ? "You’re already OG ✅"
    : `Become OG (${process.env.NEXT_PUBLIC_BBOX_OG_PRICE ?? "5.0"} USDC)`}
</button>


            <button
              onClick={() => setShowOgModal(false)}
              className="w-full py-2 rounded-xl border border-zinc-700 text-xs text-gray-300 hover:bg-zinc-900"
            >
              Maybe later
            </button>

            {buyInfo && (
              <div className="mt-3 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200/90">
                <pre className="whitespace-pre-wrap break-words text-center font-mono">{buyInfo}</pre>
              </div>
            )}

            {buyError && (
              <div className="mt-3 text-[11px] text-red-300">
                <pre className="whitespace-pre-wrap break-words text-center font-mono">{buyError}</pre>
              </div>
            )}

            {buyLoading && (
              <p className="mt-2 text-[11px] text-gray-400 text-center">Waiting for confirmation…</p>
            )}
          </div>
        </div>
      )}

      {/* RESULT MODAL */}
      {showResultModal && lastResult && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="w-full max-w-xs bg-[#050315] border border-[#1F2937] rounded-2xl px-4 py-4 relative shadow-[0_0_32px_rgba(0,0,0,0.9)]">
            <button onClick={() => setShowResultModal(false)} className="absolute right-3 top-3 text-zinc-500 hover:text-zinc-300 text-sm">
              ✕
            </button>
            <div className="text-center mt-2">
              <div className="mb-3 flex justify-center">{renderRarityBadge(lastResult.rarity)}</div>
              <h3 className="text-sm font-semibold mb-2">You opened a {renderRarityLabel(lastResult.rarity)}!</h3>
              <p className="text-lg font-bold text-[#00C2FF] mb-1">Reward: +{lastResult.points} points</p>
              <p className="text-xs text-gray-400 mb-4">Keep opening boxes to climb the leaderboard.</p>
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
    </main>
  );
}
