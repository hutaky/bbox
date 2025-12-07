// src/app/faq/page.tsx
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

export default function FAQPage() {
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [viewerPfp, setViewerPfp] = useState<string | null>(null);
  const [fid, setFid] = useState<number | null>(null);

  // HEADER – ugyanaz a logika, mint a főoldalon
  useEffect(() => {
    async function initHeader() {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("sdk.actions.ready() failed on FAQ:", e);
      }

      try {
        const ctx: any = await sdk.context;

        const ctxUser =
          ctx?.user ??
          ctx?.viewer ??
          ctx?.viewerContext?.user ??
          null;

        const ctxFid: number | null =
          ctxUser?.fid ?? ctx?.frameData?.fid ?? null;

        const queryFid = getFidFromQuery();
        const finalFid = ctxFid || queryFid || null;
        if (finalFid) setFid(finalFid);

        const uname =
          ctxUser?.username ??
          ctxUser?.displayName ??
          ctxUser?.display_name ??
          ctxUser?.name ??
          null;

        const pfp =
          ctxUser?.pfpUrl ??
          ctxUser?.pfp_url ??
          ctxUser?.pfp?.url ??
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
              <div className="text-sm font-medium truncate max-w-[120px]">
                {displayName}
              </div>
              {fid && (
                <div className="text-[11px] text-[#F4F0FF]/80">
                  FID #{fid}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* TOP BAR */}
        <div className="flex items-center justify-between mt-1 mb-3">
          <Link
            href="/"
            className="text-xs text-gray-300 hover:text-white inline-flex items-center gap-1"
          >
            <span>←</span>
            <span>Back</span>
          </Link>
          <span className="text-sm font-semibold text-gray-200">
            FAQ
          </span>
        </div>

        {/* FAQ CONTENT */}
        <section className="space-y-3 text-sm text-gray-200">
          {/* 1. What is BBOX? */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">
              What is BBOX?
            </h3>
            <p className="text-[13px] text-gray-300">
              BBOX is a daily box-opening mini-game on Farcaster.  
              You open boxes, collect points and try to climb as high
              as possible on the leaderboard each season.
            </p>
          </div>

          {/* 2. How do daily boxes work? */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">
              How do daily boxes work?
            </h3>
            <p className="text-[13px] text-gray-300 mb-1.5">
              Every day you get at least one free box.  
              When you open it, you roll a box rarity:
              <span className="font-medium"> Common → Rare → Epic → Legendary</span>.
              Rarer boxes give more points.
            </p>
            <p className="text-[12px] text-gray-400">
              When you run out of free boxes, the timer shows when your
              next free one becomes available.
            </p>
          </div>

          {/* 3. Points & leaderboard */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">
              What are points and leagues?
            </h3>
            <p className="text-[13px] text-gray-300 mb-1.5">
              Each opened box gives points.  
              Your total points decide your place on the leaderboard
              and which league you&apos;re in:
            </p>
            <ul className="text-[12px] text-gray-300 space-y-0.5 ml-1.5">
              <li>• 0 – 9 999 pts → Bronze League</li>
              <li>• 10 000 – 19 999 pts → Silver League</li>
              <li>• 20 000 – 29 999 pts → Gold League</li>
              <li>• 30 000+ pts → Platinum League</li>
            </ul>
            <p className="text-[12px] text-gray-400 mt-1.5">
              Higher league = more bragging rights and better position
              when seasonal rewards are distributed.
            </p>
          </div>

          {/* 4. Extra picks */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">
              What are extra picks?
            </h3>
            <p className="text-[13px] text-gray-300 mb-1.5">
              Extra picks let you open additional boxes on the same day,
              on top of your free ones.  
              They don&apos;t expire – if you don&apos;t use them today,
              you can use them later.
            </p>
            <p className="text-[12px] text-gray-400">
              You can collect extra picks over time or buy more inside
              the app when payments are enabled.
            </p>
          </div>

          {/* 5. Ranks & daily openings */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">
              What are BOX Based, BOX PRO and BOX OG?
            </h3>
            <p className="text-[13px] text-gray-300 mb-1.5">
              Ranks define how many free boxes you can open each day:
            </p>
            <ul className="text-[12px] text-gray-300 space-y-0.5 ml-1.5">
              <li>• <span className="font-semibold">BOX Based</span> – default rank, 1 free box / day</li>
              <li>• <span className="font-semibold">BOX PRO</span> – Farcaster Pro users, 2 free boxes / day</li>
              <li>• <span className="font-semibold">BOX OG</span> – users who buy the OG upgrade, +2 extra daily boxes</li>
            </ul>
            <p className="text-[12px] text-gray-400 mt-1.5">
              If you&apos;re PRO and also OG, you become{" "}
              <span className="font-semibold text-emerald-300">
                BOX PRO OG
              </span>{" "}
              and can open 4 boxes per day before using any extra picks.
            </p>
          </div>

          {/* 6. Seasonal rewards */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">
              Why should I care about my rank?
            </h3>
            <p className="text-[13px] text-gray-300 mb-1.5">
              Each season we plan different{" "}
              <span className="font-semibold">rewards, gifts and on-chain perks</span>{" "}
              for active players and top leaderboard positions.
            </p>
            <p className="text-[12px] text-gray-400">
              Being higher on the board never hurts – sometimes it means
              better chances for special rewards, sometimes it&apos;s just
              pure flex that you were early and active.
            </p>
          </div>

          {/* 7. OG upgrade */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">
              How do I become OG?
            </h3>
            <p className="text-[13px] text-gray-300 mb-1.5">
              OG is a one-time upgrade tied to your FID.  
              OG players get a permanent daily opening bonus and a
              unique badge in BBOX.
            </p>
            <p className="text-[12px] text-gray-400">
              When the OG upgrade is active, you&apos;ll see the option in
              the app. Until then, just keep opening your boxes and
              stacking points.
            </p>
          </div>

          {/* 8. Social / sharing */}
          <div className="bg-gradient-to-br from-[#05081F] via-[#050315] to-black border border-[#151836] rounded-3xl p-4 shadow-[0_0_26px_rgba(0,0,0,0.7)]">
            <h3 className="text-base font-semibold text-white mb-1">
              Can I share my pulls?
            </h3>
            <p className="text-[13px] text-gray-300 mb-1.5">
              Yes. After each opening you can share the result directly
              to Farcaster with one tap – including how many points you
              earned and a link back to the game.
            </p>
            <p className="text-[12px] text-gray-400">
              Crazy Legendary pulls are meant to be flexed. 😉
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
