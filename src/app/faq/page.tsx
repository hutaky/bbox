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

  // SAME HEADER LOGIC AS HOMEPAGE & LEADERBOARD
  useEffect(() => {
    async function initHeader() {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("sdk.actions.ready() failed on FAQ");
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
      } catch (_) {
        setViewerName("BBOX player");
        const q = getFidFromQuery();
        if (q) setFid(q);
      }
    }
    if (typeof window !== "undefined") initHeader();
  }, []);

  const displayName = viewerName || "BBOX player";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  return (
    <main className="min-h-screen bg-black text-white p-4 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        {/* HEADER – identical to main / leaderboard */}
        <header className="flex items-center justify-between mb-2">
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
            {viewerPfp ? (
              <img
                src={viewerPfp}
                alt={displayName}
                className="w-9 h-9 rounded-full border border-baseBlue/40 object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-baseBlue/40 flex items-center justify-center text-sm font-semibold">
                {avatarInitial}
              </div>
            )}
            <div className="text-right">
              <div className="text-sm font-medium truncate">{displayName}</div>
              {fid && (
                <div className="text-[11px] text-gray-500">FID #{fid}</div>
              )}
            </div>
          </div>
        </header>

        {/* TOP BAR */}
        <div className="flex items-center justify-between mt-2">
          <Link
            href="/"
            className="text-xs text-gray-300 hover:text-white inline-flex items-center gap-1"
          >
            <span>←</span>
            <span>Back</span>
          </Link>
          <span className="text-sm font-semibold text-gray-200">FAQ</span>
        </div>

        {/* FAQ CONTENT */}
        <section className="mt-2 space-y-4 text-sm text-gray-300">
          <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-base font-semibold text-white">What is BBOX?</h3>
            <p>
              BBOX is a daily box-opening mini-game on Farcaster.  
              Every day you get a free box — plus you can collect extra picks  
              to open even more.
            </p>
          </div>

          <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-base font-semibold text-white">How do I play?</h3>
            <p>
              Pick a box, open it, earn points.  
              Common → Legendary: the rarer the box, the bigger the reward.
            </p>
          </div>

          <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-base font-semibold text-white">
              Why should I collect more points?
            </h3>
            <p>
              Each season comes with some… let’s call them <i>special surprises</i>.  
              Being higher on the leaderboard definitely won’t hurt.  
              If nothing else — you can flex your rank all season long 😎
            </p>
          </div>

          <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-base font-semibold text-white">
              What are extra picks?
            </h3>
            <p>
              Extra picks let you open additional boxes on the same day.  
              They don’t expire and you can stack as many as you want.
            </p>
          </div>

          <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-base font-semibold text-white">Who are OGs?</h3>
            <p>
              OGs get a permanent daily bonus and a badge next to their name.  
              A small group with big benefits.
            </p>
          </div>

          <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-4 space-y-2">
            <h3 className="text-base font-semibold text-white">
              Any tips for climbing the ranks?
            </h3>
            <p>
              Open your free box daily, keep your streak alive,  
              and use extra picks smartly.  
              Rarer boxes can push you up the leaderboard fast.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
