export default function FaqPage() {
  return (
    <main className="min-h-screen px-4 py-6 flex flex-col items-center">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-center mb-2">BBOX FAQ</h1>

        <section className="rounded-2xl border border-gray-800 bg-gray-950/80 p-4 space-y-3 text-sm text-gray-200">
          <p>
            <strong>What is BBOX?</strong>
            <br />
            BBOX is a Farcaster MiniApp where you open boxes, earn points and climb the leaderboard.
            Every day you get free picks, and you can collect rare boxes for bigger rewards.
          </p>

          <p>
            <strong>How do daily picks work?</strong>
            <br />
            Every user receives daily free picks. If you run out of both free and extra picks,
            your free pick automatically refills after 24 hours from your last opening.
          </p>

          <p>
            <strong>What is the “Random Open” button?</strong>
            <br />
            Random Open consumes 1 pick and reveals a random box out of the three visible boxes.
            Each box contains points based on its rarity.
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
            More features (OG rank, extra pick packs, seasonal rewards, and more)
            may be added over time.
          </p>
        </section>
      </div>
    </main>
  );
}
