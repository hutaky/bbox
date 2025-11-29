"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import sdk from "@farcaster/frame-sdk";

export default function FaqPage() {
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [viewerPfp, setViewerPfp] = useState<string | null>(null);

  // Same header logic as on the main page
  useEffect(() => {
    async function init() {
      try {
        await sdk.actions.ready();
      } catch (e) {
        console.warn("sdk.actions.ready() failed (FAQ):", e);
      }

      try {
        const ctx: any = await sdk.context;

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

        if (uname && typeof uname === "string") {
          setViewerName(uname);
        } else {
          setViewerName("BBOX player");
        }

        if (pfp && typeof pfp === "string") {
          setViewerPfp(pfp);
        }
      } catch (e) {
        console.warn("sdk.context read failed on FAQ:", e);
        setViewerName(prev => prev || "BBOX player");
      }
    }

    if (typeof window !== "undefined") {
      void init();
    }
  }, []);

  const displayName = viewerName || "BBOX player";
  const avatarInitial = displayName.charAt(0).toUpperCase();

  return (
    <main className="min-h-screen px-4 py-6 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        {/* COMMON HEADER (same as main) */}
        <header className="flex items-center justify-between">
          {/* Logo + app name (left) */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-baseBlue to-purple-500 flex items-center justify-center text-xs font-bold">
              B
            </div>
            <span className="text-xl font-semibold">BBOX</span>
          </div>

          {/* User avatar + username (right) */}
          <div className="flex flex-col items-end gap-1">
            {viewerPfp ? (
              <img
                src={viewerPfp}
                alt="User avatar"
                className="h-8 w-8 rounded-full border border-gray-600 object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-gray-600 flex items-center justify-center text-sm font-semibold">
                {avatarInitial}
              </div>
            )}
            <span className="text-xs text-gray-300 max-w-[160px] truncate text-right">
              {displayName}
            </span>
          </div>
        </header>

        {/* Page-specific top bar */}
        <div className="flex items-center justify-between mt-2">
          <Link
            href="/"
            className="text-xs text-gray-300 hover:text-white inline-flex items-center gap-1"
          >
            <span>←</span>
            <span>Back</span>
          </Link>
          <span className="text-sm font-semibold text-gray-200">BBOX FAQ</span>
        </div>

        {/* Content */}
        <section className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4 space-y-3 text-sm text-gray-200">
          <p>
            <strong>What is BBOX?</strong>
            <br />
            BBOX is a Farcaster MiniApp where you open boxes, earn points and
            climb the leaderboard. Every day you get free picks, and you can
            collect rare boxes for bigger rewards.
          </p>

          <p>
            <strong>How do daily picks work?</strong>
            <br />
            Every user receives daily free picks. If you run out of both free
            and extra picks, your free pick automatically refills after 24 hours
            from your last opening.
          </p>

          <p>
            <strong>What is the “Random Open” button?</strong>
            <br />
            Random Open consumes 1 pick and reveals a random box out of the
            three visible boxes. Each box contains points based on its rarity.
          </p>

          <p>
            <strong>What are rarities?</strong>
            <br />
            Every box you open has a rarity: <strong>COMMON</strong>,{" "}
            <strong>RARE</strong>, <strong>EPIC</strong>, or{" "}
            <strong>LEGENDARY</strong>. Higher rarity = more points.
          </p>

          <p>
            <strong>What are points used for?</strong>
            <br />
            Points determine your position on the leaderboard. Future seasons,
            rewards and airdrops may be influenced by your points and activity.
          </p>

          <p>
            <strong>What is the Leaderboard?</strong>
            <br />
            The leaderboard shows the top players sorted by points. It displays
            usernames, rarity-open stats (C / R / E / L), and total points.
          </p>

          <p className="text-xs text-gray-400">
            More features (OG rank, extra pick packs, seasonal rewards, and
            more) may be added over time.
          </p>
        </section>
      </div>
    </main>
  );
}
