"use client";

import { useEffect, useState } from "react";

type LeaderboardRow = {
  fid: number;
  username: string | null;
  total_points: number;
  common_count: number;
  rare_count: number;
  epic_count: number;
  legendary_count: number;
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      setRows(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen text-center p-6">Loading leaderboard...</main>
    );
  }

  return (
    <main className="min-h-screen p-4 space-y-4">
      <h1 className="text-xl font-semibold text-center">BBOX Leaderboard</h1>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div
            key={r.fid}
            className="rounded-xl border border-gray-800 bg-gray-950 p-4"
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">
                {r.username || `fid:${r.fid}`}
              </span>
              <span className="text-baseBlue font-semibold">
                {r.total_points} pts
              </span>
            </div>

            <div className="text-xs text-gray-400 mt-1">
              C {r.common_count} · R {r.rare_count} · E {r.epic_count} · L{" "}
              {r.legendary_count}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
