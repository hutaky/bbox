"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import sdk from "@farcaster/frame-sdk";

function getFidFromQuery(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const f = params.get("fid");
  if (!f) return null;
  const n = Number(f);
  return Number.isFinite(n) ? n : null;
}

export default function FaqPage() {
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [viewerPfp, setViewerPfp] = useState<string | null>(null);
  const [fid, setFid] = useState<number | null>(null);

  useEffect(() => {
    async function initHeader() {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("sdk.actions.ready() failed (FAQ):", e);
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
        console.warn("sdk.context read failed on FAQ:", e);
        setViewerName((prev) => prev || "BBOX player");

        const q = getFidFromQuery();
        if (q) setFid(q);
      }
    }

    if (typeof window !== "undefined") {
      void initHeader();
    }
  }, []);

  const displayName = viewerName || "BBOX player";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  function Section({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#0B1020] via-[#050816] to-black px-4 py-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
        <h2 className="text-sm font-semibold text-slate-100 mb-2">{title}</h2>
        <div className="text-[12px] leading-relaxed text-slate-300 space-y-2">
          {children}
        </div>
      </section>
    );
  }

  function Pill({ children }: { children: React.ReactNode }) {
    return (
      <span className="inline-flex items-center rounded-full border border-[#1F6DF2]/60 bg-[#1F6DF2]/10 px-2 py-[2px] text-[10px] font-semibold text-[#23A9F2]">
        {children}
      </span>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        {/* HEADER (same vibe as leaderboard) */}
        <header className="flex items-center justify-between mb-1">
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
              <div className="text-sm font-medium truncate max-w-[140px]">
                {displayName}
              </div>
              {fid && <div className="text-[11px] text-gray-500">FID #{fid}</div>}
            </div>
          </div>
        </header>

        {/* TOP BAR */}
        <div className="flex items-center justify-between mt-1">
          <Link
            href="/"
            className="text-xs text-gray-300 hover:text-white inline-flex items-center gap-1"
          >
            <span>←</span>
            <span>Back</span>
          </Link>
          <span className="text-sm font-semibold text-gray-200">FAQ</span>
        </div>

        {/* INTRO CARD */}
        <section className="rounded-3xl border border-[#1F6DF2]/60 bg-gradient-to-br from-[#071125] via-[#020617] to-black px-4 py-3 shadow-[0_0_34px_rgba(35,169,242,0.35)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-gray-300">
                Everything you need to know about how BBOX works.
              </p>
              <p className="mt-2 text-[12px] text-slate-200">
                Open boxes daily, earn points, climb the leaderboard — and compete in monthly Seasons.
              </p>
            </div>
            <div className="shrink-0 flex flex-col gap-2 items-end">
              <Pill>Season-based</Pill>
              <Pill>Leaderboard</Pill>
            </div>
          </div>
        </section>

        {/* 1) CORE GAMEPLAY */}
        <Section title="How do I play?">
          <p>
            Each day you get free picks. One pick = one box opening. Tap any of the 3 boxes to open it.
          </p>
          <p>
            Every opening gives you a rarity and points:
            <span className="ml-2 inline-flex flex-wrap gap-2 align-middle">
              <Pill>Common</Pill>
              <Pill>Rare</Pill>
              <Pill>Epic</Pill>
              <Pill>Legendary</Pill>
            </span>
          </p>
          <p>
            Your points and opens are tracked automatically, and you’ll see your position on the leaderboard.
          </p>
        </Section>

        {/* 2) FREE PICKS & TIMER */}
        <Section title="Free picks & daily timer">
          <p>
            Free picks refill on a 24h timer. When the timer hits <b>Ready</b>, your daily free pick becomes available.
          </p>
          <p className="text-[11px] text-slate-400">
            Tip: If you have free picks left, the next timer refill won’t “stack” infinitely — use your daily pick to keep progressing.
          </p>
        </Section>

        {/* 3) EXTRA PICKS (BUY) */}
        <Section title="What are extra picks?">
          <p>
            Extra picks are paid picks you can use any time to open more boxes today and push your rank.
          </p>
          <p>
            You can buy extra picks in packs:
            <span className="ml-2 inline-flex flex-wrap gap-2 align-middle">
              <Pill>+1</Pill>
              <Pill>+5</Pill>
              <Pill>+10</Pill>
            </span>
          </p>
          <p className="text-[11px] text-slate-400">
            Important: If you edit the amount in the wallet confirmation screen, picks won’t be added (it’s treated as a donation).
          </p>
        </Section>

        {/* 4) OG */}
        <Section title="What is OG?">
          <p>
            OG is a one-time, FID-bound upgrade that gives you a permanent daily buff and a special OG badge.
          </p>
          <p>
            OG daily buff: you receive an additional daily advantage (shown in the app). Your OG status does not reset between Seasons.
          </p>
        </Section>

        {/* 5) SEASONS & RESET RULES (B) */}
        <Section title="Seasons & resets (monthly)">
          <p>
            BBOX runs in monthly Seasons. Each Season is a fresh competition, so new players can climb without being permanently behind.
          </p>
          <p>
            At the start of a new Season, these reset:
          </p>
          <ul className="list-disc ml-5 space-y-1">
            <li>Total points</li>
            <li>Box rarity counts (Common/Rare/Epic/Legendary opens)</li>
            <li>Leaderboard rankings</li>
          </ul>
          <p className="mt-2">
            These do <b>not</b> reset:
          </p>
          <ul className="list-disc ml-5 space-y-1">
            <li>OG status (FID-bound)</li>
          </ul>
          <p className="text-[11px] text-slate-400">
            Note: Paid items and edge rules may evolve with Seasons — if we change anything important, we’ll mention it in-app.
          </p>
        </Section>

        {/* 6) REWARDS / PRIZE POOL (A) */}
        <Section title="Rewards & prize pool">
          <p>
            Each Season, top leaderboard placements can earn rewards. The goal is to recycle part of the revenue back into the community.
          </p>
          <p>
            Rewards may include: USDC prizes, special perks, or other Season bonuses. Exact prize distribution can change per Season.
          </p>
          <p className="text-[11px] text-slate-400">
            We keep it flexible so we can adapt to growth — but the core idea is simple: play daily, climb ranks, and compete for prizes.
          </p>
        </Section>

        {/* 7) FAIRNESS / RNG */}
        <Section title="Is it fair?">
          <p>
            Box rarity and points are randomized. Everyone plays the same game rules — your best strategy is consistency (daily play) and smart use of extra picks.
          </p>
        </Section>

        {/* FOOTER NAV */}
        <div className="pt-1 flex gap-2">
          <Link
            href="/"
            className="flex-1 text-center text-xs py-2 rounded-2xl border border-slate-800 bg-gradient-to-r from-[#020617] via-[#020617] to-black hover:from-[#071125] hover:to-[#020617] transition"
          >
            Home
          </Link>
          <Link
            href="/leaderboard"
            className="flex-1 text-center text-xs py-2 rounded-2xl border border-slate-800 bg-gradient-to-r from-[#020617] via-[#020617] to-black hover:from-[#071125] hover:to-[#020617] transition"
          >
            Leaderboard
          </Link>
        </div>

        <p className="text-[10px] text-gray-600 text-center pt-2">
          BBOX · Season 0 · Built for Farcaster
        </p>
      </div>
    </main>
  );
}
