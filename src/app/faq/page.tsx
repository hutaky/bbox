"use client";

import Link from "next/link";

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-black text-white p-4 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        {/* Header */}
        <header className="flex items-center justify-between mb-2">
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
              <p className="text-[11px] text-gray-400">Daily Based Box game</p>
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

        <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-[#0B1020] via-[#050816] to-black px-4 py-4 shadow-[0_0_30px_rgba(35,169,242,0.15)]">
          <h2 className="text-sm font-semibold mb-2">FAQ</h2>

          <div className="space-y-4 text-[12px] text-gray-300 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-100">What is BBOX?</p>
              <p>
                BBOX is a daily mini-game on Farcaster. You open boxes to earn points and climb the leaderboard.
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-100">How many free opens do I get?</p>
              <p>
                Every player gets <span className="text-white font-semibold">1 free pick per day</span>.
                The timer shows when your next free box becomes available.
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-100">What does OG give me?</p>
              <p>
                OG is a one-time purchase, tied to your FID. OGs receive a{" "}
                <span className="text-white font-semibold">permanent daily buff</span>:
                <span className="text-white font-semibold"> +1 extra pick per day</span>.
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-100">Can I open more than once per day?</p>
              <p>
                Yes. You can buy <span className="text-white font-semibold">extra picks</span>.
                Extra picks are consumed after free picks.
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-100">How are points calculated?</p>
              <p>
                Each open returns a rarity (Common / Rare / Epic / Legendary) and a random point reward based on rarity.
                Higher rarities generally give higher points.
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-100">Why didn’t I receive picks after paying?</p>
              <p>
                If you <span className="text-white font-semibold">change the amount</span> in the wallet confirmation,
                the transfer won’t match the selected option. In that case{" "}
                <span className="text-white font-semibold">no picks are added</span> and the payment is treated as a{" "}
                <span className="text-white font-semibold">donation</span>.
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-100">Is this on Base / which token is used?</p>
              <p>
                Payments are done in <span className="text-white font-semibold">USDC on Base</span> via the native
                Farcaster wallet confirmation.
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-100">What is a Season?</p>
              <p>
                The game runs in seasons (typically monthly). Leaderboards and rewards are based on the current season.
                When a new season starts, progression may reset.
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-100">Where can I see the leaderboard?</p>
              <p>
                Open the <span className="text-white font-semibold">Leaderboard</span> page from the main screen.
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-100">Is this gambling?</p>
              <p>
                BBOX is a points game. You pay only if you choose to buy extra picks or OG. Points have no guaranteed
                monetary value.
              </p>
            </div>
          </div>
        </section>

        <div className="text-[10px] text-gray-500 text-center">
          By playing you accept that rewards, seasons, and rules may evolve over time.
        </div>
      </div>
    </main>
  );
}
