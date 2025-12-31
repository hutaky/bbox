// src/app/faq/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sdk } from "@farcaster/miniapp-sdk";

function getFidFromQuery(): number | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const f = params.get("fid");
  if (!f) return null;
  const n = Number(f);
  return Number.isFinite(n) ? n : null;
}

export default function FAQPage() {
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [viewerPfp, setViewerPfp] = useState<string | null>(null);
  const [fid, setFid] = useState<number | null>(null);

  // HEADER – ugyanaz a logika, mint a főoldalon (miniapp-sdk)
  useEffect(() => {
    let cancelled = false;

    async function initHeader() {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("sdk.actions.ready() failed on FAQ:", e);
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

        const queryFid = getFidFromQuery();
        const finalFid = ctxFid || queryFid || null;

        const uname =
          ctxUser?.username ??
          ctxUser?.displayName ??
          ctxUser?.display_name ??
          ctxUser?.name ??
          null;

        const pfp = ctxUser?.pfpUrl ?? ctxUser?.pfp_url ?? ctxUser?.pfp?.url ?? null;

        if (cancelled) return;

        if (finalFid) setFid(finalFid);
        setViewerName(uname || "BBOX player");
        if (pfp && typeof pfp === "string") setViewerPfp(pfp);
      } catch (e) {
        console.warn("sdk.context read failed on FAQ:", e);
        if (cancelled) return;

        setViewerName((prev) => prev || "BBOX player");
        const q = getFidFromQuery();
        if (q) setFid(q);
      }
    }

    if (typeof window !== "undefined") void initHeader();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = viewerName || "BBOX player";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#02010A] via-[#050315] to-black text-white">
      <div className="max-w-md mx-auto px-4 pb-6 pt-4">
        {/* HEADER – egyezzen a főoldallal */}
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
            {viewerPfp ? (
              <img
                src={viewerPfp}
                alt={displayName}
                className="w-9 h-9 rounded-full border border-[#00C2FF]/40 shadow-[0_0_18px_rgba(0,194,255,0.6)] object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full border border-[#00C2FF]/40 bg-gradient-to-br from-[#16162A] to-[#050315] flex items-center justify-center shadow-[0_0_18px_rgba(0,194,255,0.4)] text-sm font-semibold">
                {avatarInitial}
              </div>
            )}
            <div className="text-right">
              <div className="text-sm font-medium truncate max-w-[120px]">{displayName}</div>
              {fid && <div className="text-[11px] text-[#F4F0FF]/80">FID #{fid}</div>}
            </div>
          </div>
        </header>

        {/* TOP BAR */}
        <div className="flex items-center justify-between mt-1 mb-3">
          <Link href="/" className="text-xs text-gray-300 hover:text-white inline-flex items-center gap-1">
            <span>←</span>
            <span>Back</span>
          </Link>
          <span className="text-sm font-semibold text-gray-200">FAQ</span>
        </div>

        {/* FOMO / “don’t miss out” callout (no airdrop mention) */}
        <div className="mb-3 rounded-3xl border border-[#1C2348] bg-gradient-to-br from-[#070B2A] via-[#050315] to-black p-4 shadow-[0_0_28px_rgba(0,0,0,0.7)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 w-9 h-9 rounded-2xl bg-[#00C2FF]/10 border border-[#00C2FF]/30 flex items-center justify-center">
              <span className="text-[#00C2FF] text-lg">⚡</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white">Early momentum matters</h3>
              <p className="text-[12px] text-gray-300 mt-1 leading-snug">
                BBOX is a daily game with seasonal leaderboards. The simplest edge is consistency:
                show up daily, stack points, and climb while the season is fresh.
              </p>
              <p className="text-[12px] text-gray-400 mt-2 leading-snug">
                If you’re reading this — you’re early. Don’t sit out the fun. 😉
              </p>
            </div>
          </div>
        </div>

        {/* FAQ CONTENT */}
        <section className="space-y-3 text-sm text-gray-200">
          {/* 1. What is BBOX? */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">What is BBOX?</h3>
            <p className="text-[13px] text-gray-300 leading-snug">
              BBOX is a daily box-opening mini game inside Farcaster. Open boxes, roll rarities, earn points,
              and climb the leaderboard each season.
            </p>
          </div>

          {/* 2. How to play */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">How do daily boxes work?</h3>
            <p className="text-[13px] text-gray-300 mb-2 leading-snug">
              Every day you get at least one free box. When you open it, you roll a rarity:
              <span className="font-medium"> Common → Rare → Epic → Legendary</span>.
              Rarer boxes give more points.
            </p>
            <p className="text-[12px] text-gray-400 leading-snug">
              When you run out of free boxes, the timer shows when your next free one becomes available.
            </p>
          </div>

          {/* 3. Points & leaderboard */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">Points, leagues & leaderboard</h3>
            <p className="text-[13px] text-gray-300 mb-2 leading-snug">
              Every opened box adds points. Your total points decide your league and leaderboard rank:
            </p>
            <ul className="text-[12px] text-gray-300 space-y-0.5 ml-1.5">
              <li>• 0 – 9 999 pts → Bronze League</li>
              <li>• 10 000 – 19 999 pts → Silver League</li>
              <li>• 20 000 – 29 999 pts → Gold League</li>
              <li>• 30 000+ pts → Platinum League</li>
            </ul>
            <p className="text-[12px] text-gray-400 mt-2 leading-snug">
              Leaderboards are where the season story is written. Consistent daily play beats “one lucky day”.
            </p>
          </div>

          {/* 4. Extra picks */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">What are extra picks?</h3>
            <p className="text-[13px] text-gray-300 mb-2 leading-snug">
              Extra picks let you open additional boxes on top of your free ones.
              They don’t expire — unused picks stay on your account.
            </p>
            <p className="text-[12px] text-gray-400 leading-snug">
              You can buy extra picks in-app with a native Farcaster wallet confirmation (no new tab).
            </p>
          </div>

          {/* 5. Ranks (no PRO) */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">What are BOX Based and BOX OG?</h3>
            <p className="text-[13px] text-gray-300 mb-2 leading-snug">
              Ranks define your identity inside BBOX:
            </p>
            <ul className="text-[12px] text-gray-300 space-y-0.5 ml-1.5">
              <li>
                • <span className="font-semibold">BOX Based</span> — default rank (everyone starts here)
              </li>
              <li>
                • <span className="font-semibold">BOX OG</span> — a one-time upgrade tied to your FID, with a permanent daily buff and a unique badge
              </li>
            </ul>
            <p className="text-[12px] text-gray-400 mt-2 leading-snug">
              OG is designed for players who want to be recognized as early + consistent.
            </p>
          </div>

          {/* 6. Payments / security */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">How do payments work?</h3>
            <p className="text-[13px] text-gray-300 mb-2 leading-snug">
              Purchases use a native Farcaster wallet confirmation and are verified on-chain.
              No external checkout tabs.
            </p>
            <p className="text-[12px] text-gray-400 leading-snug">
              Important: if you change the amount in the wallet screen, the transfer is treated as a donation and no picks are added.
              Thanks for supporting BBOX 💙
            </p>
          </div>

          {/* 7. Sharing */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">Can I share my pulls?</h3>
            <p className="text-[13px] text-gray-300 mb-2 leading-snug">
              Yes. After each opening you can share your result to Farcaster with one tap — including the points you earned and a link back to the game.
            </p>
            <p className="text-[12px] text-gray-400 leading-snug">Legendary pulls are meant to be flexed. 😉</p>
          </div>

          {/* 8. “Don’t miss out” closer */}
          <div className="bg-gradient-to-br from-[#070B2A] via-[#050315] to-black border border-[#1C2348] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">Any tips?</h3>
            <p className="text-[13px] text-gray-300 leading-snug">
              Don’t overthink it: open daily, share big hits, and keep your streak alive.
              Seasons move fast — it’s more fun to be on the board than watching from the sidelines.
            </p>

            <div className="mt-3 flex gap-2">
              <Link
                href="/leaderboard"
                className="flex-1 text-center text-xs py-2 rounded-2xl border border-[#151836] bg-gradient-to-r from-[#050315] to-[#05081F] hover:from-[#070921] hover:to-[#0B102F] transition shadow-[0_0_18px_rgba(0,0,0,0.6)]"
              >
                View leaderboard
              </Link>
              <Link
                href="/"
                className="flex-1 text-center text-xs py-2 rounded-2xl border border-[#151836] bg-gradient-to-r from-[#050315] to-[#05081F] hover:from-[#070921] hover:to-[#0B102F] transition shadow-[0_0_18px_rgba(0,0,0,0.6)]"
              >
                Open a box
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
