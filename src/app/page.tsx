"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sdk } from "@farcaster/miniapp-sdk";
import type { ApiUserState } from "@/types";
import confetti from "canvas-confetti";

// ✅ Share-hez ezt használjuk (szép embed, nem látszik a vercel domain)
const SHARE_APP_URL = "https://farcaster.xyz/miniapps/c70HLy47umXy/bbox";

// (ha kell máshol, maradhat, de share-ben már nem ezt használjuk)
const BBOX_URL = "https://box-sage.vercel.app";

type BoxRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

interface LastResult {
  rarity: BoxRarity;
  points: number;
  openedAt: string;
}

type GlobalStats = {
  common: number;
  rare: number;
  epic: number;
  legendary: number;
  total: number;
};

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

function extractSendTokenDebug(result: any): string {
  const reason = typeof result?.reason === "string" ? result.reason : "";
  const msg = result?.error?.message ?? result?.message ?? "";
  const combined = `${reason} ${msg}`.trim();
  return combined || "unknown";
}

function isWrongAmountLike(settleData: any): boolean {
  const err = String(settleData?.error ?? "").toLowerCase();
  if (err.includes("wrong amount")) return true;

  let details = "";
  try {
    details = JSON.stringify(settleData?.details ?? {});
  } catch {}
  details = details.toLowerCase();
  return details.includes("expected") && details.includes("actual");
}

function donationInfoText(kindLabel: string) {
  return [
    "Thanks for supporting BBOX 💙",
    "",
    `We received your payment, but the amount didn’t match the selected option (${kindLabel}).`,
    "No picks were added.",
    "",
    "If you change the amount in the wallet screen, the transfer is treated as a donation.",
  ].join("\n");
}

function AnimatedOgPill() {
  return (
    <span className="relative inline-flex items-center">
      <span className="absolute -inset-1 rounded-full bg-purple-500/20 blur-md animate-pulse" />
      <span className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-purple-300/60 bg-purple-500/10 text-purple-200">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-300 shadow-[0_0_10px_rgba(192,132,252,0.9)] animate-pulse" />
        OG
      </span>
    </span>
  );
}

function fireConfetti(rarity: BoxRarity) {
  const base = {
    spread: 70,
    origin: { y: 0.65 as const },
    ticks: 200,
  };

  const intensity =
    rarity === "LEGENDARY"
      ? 1.0
      : rarity === "EPIC"
      ? 0.7
      : rarity === "RARE"
      ? 0.45
      : 0.25;

  const particleCount = Math.floor(120 * intensity) + 30;

  confetti({ ...base, particleCount, angle: 60, startVelocity: 45 });
  confetti({ ...base, particleCount, angle: 120, startVelocity: 45 });

  if (rarity === "LEGENDARY") {
    setTimeout(() => {
      confetti({
        particleCount: 180,
        spread: 120,
        origin: { y: 0.2 },
        startVelocity: 35,
        ticks: 260,
      });
    }, 180);
  }
}

/**
 * Share: mobilon + böngészőben is működjön.
 * - MiniApp hostban: sdk.actions.openUrl()
 * - Fallback: window.open / location.href
 */
async function openShareUrl(url: string) {
  try {
    await sdk.actions.openUrl(url);
    return;
  } catch {
    // fallback
  }

  if (typeof window !== "undefined") {
    try {
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (w) return;
    } catch {}
    window.location.href = url;
  }
}

function buildWarpcastComposeUrl(text: string, embedUrl?: string) {
  const base = "https://warpcast.com/~/compose";
  const params = new URLSearchParams();
  params.set("text", text);
  if (embedUrl) params.append("embeds[]", embedUrl);
  return `${base}?${params.toString()}`;
}

// ✅ Season banner config (állítsd be a Season végét)
const SEASON_END_ISO = "2026-02-01T00:00:00.000Z"; // <-- állítsd át

function formatTimeLeft(targetIso: string) {
  const target = new Date(targetIso).getTime();
  const now = Date.now();
  let diff = target - now;
  if (diff <= 0) return "Ended";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}


// ✅ EVM address extractor (több lehetséges context mezőből)
function extractEvmAddress(context: any, ctxUser: any): string | null {
  const candidates: any[] = [
    // gyakori mezők user-en
    ctxUser?.custodyAddress,
    ctxUser?.custody_address,
    ctxUser?.address,
    ctxUser?.walletAddress,
    ctxUser?.wallet_address,

    // context-en
    context?.custodyAddress,
    context?.custody_address,
    context?.address,

    // frameData-n
    context?.frameData?.custodyAddress,
    context?.frameData?.custody_address,
    context?.frameData?.address,

    // verified addresses (többféle shape)
    ctxUser?.verifiedAddresses?.ethAddresses?.[0],
    ctxUser?.verified_addresses?.eth_addresses?.[0],
    context?.verifiedAddresses?.ethAddresses?.[0],
    context?.verified_addresses?.eth_addresses?.[0],
  ];

  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") {
      const s = c.trim();
      if (/^0x[a-fA-F0-9]{40}$/.test(s)) return s;
    }
    if (Array.isArray(c) && typeof c[0] === "string") {
      const s = String(c[0]).trim();
      if (/^0x[a-fA-F0-9]{40}$/.test(s)) return s;
    }
  }

  return null;
}

export default function HomePage() {
  const [fid, setFid] = useState<number | null>(null);
  const [user, setUser] = useState<ApiUserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [countdown, setCountdown] = useState<string>("");
  const [seasonLeft, setSeasonLeft] = useState<string>(() => formatTimeLeft(SEASON_END_ISO));

  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showOgModal, setShowOgModal] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buyInfo, setBuyInfo] = useState<string | null>(null);

  // ✅ GLOBAL STATS (community opens)
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [globalStatsErr, setGlobalStatsErr] = useState<string | null>(null);

  // opening animáció trigger
  const [openAnimIndex, setOpenAnimIndex] = useState<number | null>(null);
  const openAnimTimerRef = useRef<number | null>(null);

  const mountedRef = useRef(true);

  async function loadUserState(
    currentFid: number | null,
    profile?: { username?: string | null; pfpUrl?: string | null; address?: string | null } // ✅ address
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
          address: profile?.address ?? null, // ✅ elküldjük
        }),
        cache: "no-store",
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

  // ✅ Global stats fetch (külön függvény, hogy tudjuk hívni pollingból + pick után is)
  const refreshGlobalStats = async () => {
    try {
      setGlobalStatsErr(null);

      // cache-bypass: timestamp query param
      const res = await fetch(`/api/global-stats?t=${Date.now()}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGlobalStatsErr(data?.error || "Failed to load global stats");
        return;
      }

      setGlobalStats(data as GlobalStats);
    } catch {
      setGlobalStatsErr("Failed to load global stats");
    }
  };

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

        const ctxFid: number | null =
          ctxUser?.fid ?? context?.frameData?.fid ?? null;

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
          address: extractEvmAddress(context, ctxUser), // ✅ ÚJ
        };

        const queryFid = getFidFromQuery();
        const finalFid = ctxFid || queryFid;

        if (!cancelled) {
          setFid(finalFid);
          await loadUserState(finalFid, profile);
          // ✅ initkor töltsük be a global statot is
          await refreshGlobalStats();
        }
      } catch (e) {
        console.error("Error reading sdk.context:", e);
        const queryFid = getFidFromQuery();
        if (!cancelled) {
          setFid(queryFid);
          await loadUserState(queryFid, undefined);
          await refreshGlobalStats();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (openAnimTimerRef.current) {
        window.clearTimeout(openAnimTimerRef.current);
        openAnimTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Countdown ----
  useEffect(() => {
    if (!user?.nextFreePickAt) {
      setCountdown("Ready");
      return;
    }
    const interval = window.setInterval(() => {
      setCountdown(formatCountdown(user.nextFreePickAt));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [user?.nextFreePickAt]);

  useEffect(() => {
  const interval = window.setInterval(() => {
    setSeasonLeft(formatTimeLeft(SEASON_END_ISO));
  }, 60_000); // elég percenként
  return () => window.clearInterval(interval);
}, []);


  // ✅ REALTIME-ish: polling + refetch amikor visszatér a tab/app
  useEffect(() => {
    // 10 mp-enként frissít
    const interval = window.setInterval(() => {
      void refreshGlobalStats();
    }, 10_000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshGlobalStats();
      }
    };

    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPick =
    (user?.freePicksRemaining ?? 0) > 0 ||
    (user?.extraPicksRemaining ?? 0) > 0;

  const isOg = Boolean(user?.isOg);
  const freePicks = Number(user?.freePicksRemaining ?? 0);
  const extraPicks = Number(user?.extraPicksRemaining ?? 0);

  function startOpenAnim(index: number) {
    setOpenAnimIndex(index);
    if (openAnimTimerRef.current) window.clearTimeout(openAnimTimerRef.current);
    openAnimTimerRef.current = window.setTimeout(() => {
      setOpenAnimIndex(null);
      openAnimTimerRef.current = null;
    }, 520);
  }

  // ---- Pick ----
  async function handlePick(boxIndex: number) {
    if (!fid || !user || picking) return;
    const canNowPick =
      (user?.freePicksRemaining ?? 0) > 0 ||
      (user?.extraPicksRemaining ?? 0) > 0;
    if (!canNowPick) return;

    try {
      setPicking(true);
      startOpenAnim(boxIndex);

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

      // ✅ azonnali community refresh, hogy tényleg látszódjon a növekedés
      void refreshGlobalStats();

      // 🎉 confetti
      fireConfetti(data.rarity);
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
    const text =
      `🎁 Pulled a ${rarityLabel} box on BBOX (+${lastResult.points} pts)\n\n` +
      `Come open your daily boxes 👇`;

    const composeUrl = buildWarpcastComposeUrl(text, SHARE_APP_URL);

    try {
      await openShareUrl(composeUrl);
    } catch (e) {
      console.error("Share failed:", e);
      alert("Could not open share dialog.");
    }
  }

  // ---- Payments ----
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

      const token = data?.token as string | undefined;
      const amount = data?.amount as string | undefined;
      const recipientAddress = data?.recipientAddress as string | undefined;

      if (!token || !amount || !recipientAddress) {
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
            sdkDebug: extractSendTokenDebug(result),
            details: result,
          })
        );
        setBuyLoading(false);
        return;
      }

      const txHash = result?.send?.transaction;
      if (!txHash || typeof txHash !== "string") {
        setBuyError(
          buildPayDebugMessage("Payment confirmed, but missing tx hash.", {
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
        body: JSON.stringify({
          fid,
          kind: "extra_picks",
          packSize,
          txHash,
        }),
        cache: "no-store",
      });

      const settleData = await settleRes.json().catch(() => ({}));
      if (!settleRes.ok) {
        if (isWrongAmountLike(settleData)) {
          const label =
            packSize === 1 ? "1-pack" : packSize === 5 ? "5-pack" : "10-pack";
          setBuyInfo(donationInfoText(label));
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
        address: (user as any)?.address ?? null,
      });

      // ✅ ha vásárolt, attól még jó frissíteni
      void refreshGlobalStats();

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

    if (user?.isOg) {
      setBuyInfo("You’re already OG ✅");
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

      const token = data?.token as string | undefined;
      const amount = data?.amount as string | undefined;
      const recipientAddress = data?.recipientAddress as string | undefined;

      if (!token || !amount || !recipientAddress) {
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
            sdkDebug: extractSendTokenDebug(result),
            details: result,
          })
        );
        setBuyLoading(false);
        return;
      }

      const txHash = result?.send?.transaction;
      if (!txHash || typeof txHash !== "string") {
        setBuyError(
          buildPayDebugMessage("Payment confirmed, but missing tx hash.", {
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
        body: JSON.stringify({
          fid,
          kind: "og_rank",
          txHash,
        }),
        cache: "no-store",
      });

      const settleData = await settleRes.json().catch(() => ({}));
      if (!settleRes.ok) {
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
        address: (user as any)?.address ?? null,
      });

      void refreshGlobalStats();

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
        <header className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/icon.png"
              alt="BBOX logo"
              className="w-9 h-9 rounded-xl border border-[#00C2FF]/40 shadow-[0_0_18px_rgba(0,194,255,0.6)] bg-black/60"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2 min-w-0">
                <span className="shrink-0">BBOX</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 border border-emerald-400/60 text-emerald-200 shrink-0">
                  Season 0
                </span>
              </h1>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                <span className="truncate">Daily Based Box game</span>
              </p>
            </div>
          </div>

          {/* Header stabil */}
          <div className="flex items-center gap-2 min-w-0">
            {user?.pfpUrl ? (
              <img
                src={user.pfpUrl}
                alt={displayName}
                className="w-9 h-9 rounded-full border border-[#00C2FF]/40 shadow-[0_0_18px_rgba(0,194,255,0.6)] object-cover shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full border border-[#00C2FF]/40 bg-gradient-to-br from-[#16162A] to-[#050315] flex items-center justify-center shadow-[0_0_18px_rgba(0,194,255,0.4)] text-sm font-semibold shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="text-right min-w-0">
              <div className="text-sm font-medium truncate max-w-[150px]">{displayName}</div>
              <div className="text-[11px] text-[#F4F0FF]/80 flex items-center justify-end gap-2">
                {isOg ? (
                  <>
                    <AnimatedOgPill />
                  </>
                ) : (
                  <span>Based</span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* STATS CARD */}
        <section className="relative bg-gradient-to-br from-[#070B2A] via-[#050315] to-black border border-[#1C2348] rounded-3xl px-4 py-4 mb-4 shadow-[0_0_40px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="absolute -left-24 -bottom-24 w-52 h-52 rounded-full bg-[#00C2FF]/10 blur-3xl pointer-events-none" />
          <div className="absolute -right-20 -top-24 w-52 h-52 rounded-full bg-[#7C3AED]/15 blur-3xl pointer-events-none" />

          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="flex-1 min-w-0">
              <div className="flex justify-between text-[11px] text-[#A6B0FF]/80">
                <span className="tracking-[0.18em]">TOTAL POINTS:</span>
                <span className="font-semibold text-[13px] text-[#E6EBFF]">{user?.totalPoints ?? 0}</span>
              </div>

              <div className="flex justify-between text-xs text-[#B0BBFF]/80 mt-2">
                <span>Extra picks:</span>
                <span className="font-medium text-emerald-300">{extraPicks}</span>
              </div>

              <div className="mt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#B0BBFF]/80">Free picks:</span>
                  <span className={`text-sm font-semibold ${isOg ? "text-purple-200" : "text-sky-300"} shrink-0`}>
                    {freePicks}
                  </span>
                </div>
              </div>

              <div className="text-[11px] mt-2 flex items-start justify-between gap-2 text-[#A6B0FF]/80">
                <span className="shrink-0">Next free box:</span>
                <div className="text-right">
                  <div className={`font-semibold ${isOg ? "text-purple-200" : "text-emerald-300"}`}>
                    {countdown || "Ready"}
                  </div>

                  {isOg ? (
                    <div className="mt-1 text-[10px] text-purple-200/90">+1 extra box as OG</div>
                  ) : (
                    <button
                      onClick={() => {
                        setShowOgModal(true);
                        setBuyError(null);
                        setBuyInfo(null);
                      }}
                      className="mt-1 text-[10px] text-purple-200/90 hover:text-purple-200 underline decoration-dotted"
                    >
                      → Become OG
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              <div className="px-3 py-2 rounded-2xl bg-gradient-to-br from-[#14162F] via-[#191B3D] to-[#050315] border border-[#2B3170] shadow-[0_0_20px_rgba(124,58,237,0.3)] min-w-[120px]">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#9CA3FF]/90 mb-1">
                  {isOg ? "BOX OG" : "BOX Based"}
                </div>
                <div className="text-xs font-semibold text-[#F4F0FF]">{league}</div>
              </div>

              <button
                onClick={() => {
                  setShowBuyModal(true);
                  setBuyError(null);
                  setBuyInfo(null);
                }}
                className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-2xl bg-gradient-to-r from-[#2563EB] via-[#00C2FF] to-[#22C55E] text-xs font-semibold shadow-[0_0_24px_rgba(37,99,235,0.8)] hover:brightness-110 transition"
              >
                <span className="text-[12px]">+ Buy extra</span>
              </button>
            </div>
          </div>
        </section>
{/* ✅ SEASON BANNER (marquee + reduced-motion fallback) */}
<section className="mb-3">
  <div className="rounded-3xl border border-[#151836] bg-gradient-to-br from-[#050315] via-[#05081F] to-black shadow-[0_0_22px_rgba(0,0,0,0.65)] overflow-hidden">
    {/* top thin strip */}
    <div className="px-4 py-2 border-b border-[#151836] flex items-center justify-between gap-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[#9CA3FF]/80">
        Season 0
      </div>
      <div className="text-[10px] text-gray-400">
        Ends in <span className="font-semibold text-emerald-200">{seasonLeft}</span>
      </div>
    </div>

    {/* marquee row */}
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black via-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-black via-black/70 to-transparent" />

      <div className="py-2">
        <div className="marquee text-[12px] text-slate-200">
          <div className="marquee__inner">
            <span className="mx-6">
              ⏳ Season ends in <b>{seasonLeft}</b>
            </span>
            <span className="mx-6">
              🏆 Prize pool funded by purchases
            </span>
            <span className="mx-6">
              📈 Climb the leaderboard daily
            </span>

            {/* duplicate for seamless loop */}
            <span className="mx-6" aria-hidden="true">
              ⏳ Season ends in <b>{seasonLeft}</b>
            </span>
            <span className="mx-6" aria-hidden="true">
              🏆 Prize pool funded by purchases
            </span>
            <span className="mx-6" aria-hidden="true">
              📈 Climb the leaderboard daily
            </span>
          </div>
        </div>

        {/* reduced motion fallback */}
        <div className="marquee--reduced px-4 text-[12px] text-slate-200 hidden">
          ⏳ Season ends in <b>{seasonLeft}</b> · 🏆 Prize pool funded by purchases
        </div>
      </div>
    </div>
  </div>
</section>

        {!canPick && (
          <div className="mb-3 text-xs text-amber-200 bg-gradient-to-r from-amber-600/40 via-amber-500/20 to-amber-900/40 border border-amber-400/70 rounded-2xl px-3 py-2 shadow-[0_0_18px_rgba(251,191,36,0.55)]">
            
            <p className="text-[10px]">
              wait until the timer hits <span className="font-semibold">Ready</span> or buy extra picks to keep opening.
            </p>
          </div>
        )}

{/* BOX GRID */}
<section className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl px-4 py-4 mb-4 shadow-[0_0_30px_rgba(0,0,0,0.85)]">
  <div className="flex items-center justify-between mb-2">
    <h2 className="text-sm font-medium">Pick your box</h2>
    <span className="text-[11px] text-gray-400">One tap = one opening</span>
  </div>

  <div className="grid grid-cols-3 gap-3 mb-4">
    {[0, 1, 2].map((index) => {
      const isOpening = openAnimIndex === index && picking;

      return (
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
          {/* hover overlayek */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#00C2FF]/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute inset-0 translate-x-[-120%] skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:translate-x-[120%] transition-transform duration-700 ease-out" />

          {/* KÉP: kitölti a kártyát */}
          <img
            src="/pick.png"
            alt="open BBOX"
            className={[
              "absolute inset-0 w-full h-full object-cover", // ✅ fill
              "drop-shadow-[0_0_55px_rgba(124,58,237,0.85)]",
              "transition-all duration-500 ease-out",
              "group-hover:scale-110",
              isOpening ? "scale-[1.22] blur-[2px] opacity-0" : "scale-100 blur-0 opacity-100",
            ].join(" ")}
          />

          {/* alsó label */}
<div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium
    bg-black/50 backdrop-blur
    text-gray-300
    opacity-70
    group-hover:opacity-100
    transition">
    open
  </span>
</div>

        </button>
      );
    })}
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

        {/* GLOBAL STATS CARD */}
        <section className="mt-3 flex justify-center">
          <div className="w-full rounded-3xl border border-[#151836] bg-gradient-to-br from-[#050315] via-[#05081F] to-black px-4 py-3 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
            <div className="text-center">
              {globalStats ? (
                <>
                  <div className="mt-1 text-sm font-semibold text-[#E6EBFF]">
                    Community opened a total of {globalStats.total.toLocaleString()} boxes
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-2xl border border-zinc-800 bg-black/30 py-2">
                      <div className="text-[10px] text-gray-400">Common</div>
                      <div className="text-sm font-bold text-gray-200">{globalStats.common.toLocaleString()}</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-black/30 py-2">
                      <div className="text-[10px] text-gray-400">Rare</div>
                      <div className="text-sm font-bold text-rare">{globalStats.rare.toLocaleString()}</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-black/30 py-2">
                      <div className="text-[10px] text-gray-400">Epic</div>
                      <div className="text-sm font-bold text-epic">{globalStats.epic.toLocaleString()}</div>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-black/30 py-2">
                      <div className="text-[10px] text-gray-400">Legendary</div>
                      <div className="text-sm font-bold text-legendary">{globalStats.legendary.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] text-gray-500">Auto-refresh: every 10s</div>
                </>
              ) : (
                <div className="mt-2 text-[11px] text-gray-400">{globalStatsErr ?? "Loading…"}</div>
              )}
            </div>
          </div>
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
              <p className="text-[11px] text-gray-400">This opens a native Farcaster wallet confirmation.</p>
            </div>

            <div className="mb-3 rounded-2xl border border-[#1C2348] bg-[#070B2A]/40 px-3 py-2">
              <p className="text-[11px] text-gray-300 leading-snug">
                Heads up: If you change the amount in the wallet screen, no picks will be added. The transfer will be
                treated as a donation — thanks for supporting BBOX 💙
              </p>
            </div>

            <div className="space-y-2 mb-3">
              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(1)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                <span>+1 extra pick</span>
                <span className="text-gray-300">{process.env.NEXT_PUBLIC_BBOX_PRICE_1 ?? "0.5"} USDC</span>
              </button>

              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(5)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                <span>+5 extra picks</span>
                <span className="text-gray-300">{process.env.NEXT_PUBLIC_BBOX_PRICE_5 ?? "2.0"} USDC</span>
              </button>

              <button
                disabled={buyLoading}
                onClick={() => handleBuyExtra(10)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs"
              >
                <span>+10 extra picks</span>
                <span className="text-gray-300">{process.env.NEXT_PUBLIC_BBOX_PRICE_10 ?? "3.5"} USDC</span>
              </button>
            </div>

            {buyInfo && (
              <div className="mt-3 text-[11px] text-emerald-200">
                <pre className="whitespace-pre-wrap break-words text-center font-mono">{buyInfo}</pre>
              </div>
            )}

            {buyError && (
              <div className="mt-3 text-[11px] text-red-300">
                <pre className="whitespace-pre-wrap break-words text-center font-mono">{buyError}</pre>
              </div>
            )}

            {buyLoading && <p className="mt-2 text-[11px] text-gray-400 text-center">Waiting for confirmation…</p>}
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
              {user?.isOg ? "You’re already OG ✅" : `Become OG (${process.env.NEXT_PUBLIC_BBOX_OG_PRICE ?? "5.0"} USDC)`}
            </button>

            <button
              onClick={() => setShowOgModal(false)}
              className="w-full py-2 rounded-xl border border-zinc-700 text-xs text-gray-300 hover:bg-zinc-900"
            >
              Maybe later
            </button>

            {buyInfo && (
              <div className="mt-3 text-[11px] text-emerald-200">
                <pre className="whitespace-pre-wrap break-words text-center font-mono">{buyInfo}</pre>
              </div>
            )}

            {buyError && (
              <div className="mt-3 text-[11px] text-red-300">
                <pre className="whitespace-pre-wrap break-words text-center font-mono">{buyError}</pre>
              </div>
            )}

            {buyLoading && <p className="mt-2 text-[11px] text-gray-400 text-center">Waiting for confirmation…</p>}
          </div>
        </div>
      )}
    </main>
  );
}
