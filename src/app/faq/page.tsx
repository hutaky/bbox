"use client";

import Link from "next/link";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-400/60 text-emerald-200">
      {children}
    </span>
  );
}

function Q({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[12px] font-semibold text-[#E6EBFF]">{children}</h3>;
}

function A({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-gray-300 mt-1">{children}</p>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[#151836] bg-gradient-to-br from-[#050315] via-[#05081F] to-black px-4 py-4 shadow-[0_0_22px_rgba(0,0,0,0.65)]">
      {children}
    </section>
  );
}

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#02010A] via-[#050315] to-black text-white">
      <div className="max-w-md mx-auto px-4 pb-6 pt-4 space-y-3">
        {/* HEADER – passzol a többi oldalhoz */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/icon.png"
              alt="BBOX logo"
              className="w-9 h-9 rounded-xl border border-[#00C2FF]/40 shadow-[0_0_18px_rgba(0,194,255,0.6)] bg-black/60"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-xl font-semibold tracking-tight shrink-0">BBOX</h1>
                <Pill>Season 0</Pill>
              </div>
              <p className="text-[11px] text-gray-400 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                <span className="truncate">Daily Based Box game</span>
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="text-xs text-gray-300 hover:text-white inline-flex items-center gap-1"
          >
            <span>←</span>
            <span>Back</span>
          </Link>
        </header>

        {/* HERO / INFO CARD */}
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-[#9CA3FF]/80">
                FAQ
              </div>
              <div className="mt-1 text-sm font-semibold text-[#E6EBFF]">
                Everything you need to know
              </div>
              <div className="mt-1 text-[11px] text-gray-400">
                Rules, picks, payments, seasons.
              </div>
            </div>

            <div className="shrink-0 w-10 h-10 rounded-2xl border border-[#2B3170] bg-gradient-to-br from-[#14162F] via-[#191B3D] to-[#050315] shadow-[0_0_20px_rgba(124,58,237,0.25)] flex items-center justify-center">
              <span className="text-sm">❔</span>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-[#1C2348] bg-[#070B2A]/40 px-3 py-2">
            <p className="text-[11px] text-gray-300 leading-snug">
              Tip: if something looks stuck, close the miniapp and open again from Farcaster.
            </p>
          </div>
        </Card>

        {/* Q/A LIST */}
        <Card>
          <div className="space-y-4">
            <div>
              <Q>What is BBOX?</Q>
              <A>
                A daily mini-game on Farcaster. Open boxes, earn points, climb the leaderboard.
              </A>
            </div>

            <div>
              <Q>How many free opens do I get?</Q>
              <A>
                Every player gets <span className="text-white font-semibold">1 free pick per day</span>.
                The timer shows when your next free pick becomes available.
              </A>
            </div>

            <div>
              <Q>What does OG give me?</Q>
              <A>
                OG is a one-time purchase, FID-bound. OGs receive a permanent daily buff:
                <span className="text-white font-semibold"> +1 extra pick per day</span>.
              </A>
            </div>

            <div>
              <Q>Can I open more than once per day?</Q>
              <A>
                Yes. You can buy <span className="text-white font-semibold">extra picks</span>.
                Free picks are used first, then extra picks.
              </A>
            </div>

            <div>
              <Q>How are points calculated?</Q>
              <A>
                Each open gives a rarity (Common / Rare / Epic / Legendary) and a random point reward based on rarity.
                Higher rarity usually means higher points.
              </A>
            </div>

            <div>
              <Q>Payments: why didn’t I receive picks after paying?</Q>
              <A>
                If you <span className="text-white font-semibold">change the amount</span> in the wallet confirmation,
                the transfer won’t match the selected option. In that case{" "}
                <span className="text-white font-semibold">no picks are added</span> and it’s treated as a{" "}
                <span className="text-white font-semibold">donation</span>. Thanks for supporting BBOX 💙
              </A>
            </div>

            <div>
              <Q>Which chain / token is used for payments?</Q>
              <A>
                Payments are done in <span className="text-white font-semibold">USDC on Base</span> via the native
                Farcaster wallet confirmation.
              </A>
            </div>

            <div>
              <Q>What is a Season?</Q>
              <A>
                The game runs in seasons (typically monthly). Leaderboard rankings and rewards are based on the current season.
                When a new season starts, progress may reset.
              </A>
            </div>

            <div>
              <Q>Where can I see the leaderboard?</Q>
              <A>
                Tap <span className="text-white font-semibold">Leaderboard</span> from the main screen.
              </A>
            </div>

            <div>
              <Q>Is this gambling?</Q>
              <A>
                This is a points game. You only pay if you choose to buy extra picks or OG.
                Points have no guaranteed monetary value.
              </A>
            </div>
          </div>
        </Card>

        {/* FOOTER NOTE */}
        <div className="text-center text-[10px] text-gray-500 px-2">
          By playing you accept that rules, rewards, and seasons may evolve over time.
        </div>
      </div>
    </main>
  );
}
