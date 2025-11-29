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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/leaderboard");
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to load leaderboard");
        } else {
          setRows(data);
        }
      } catch (e: any) {
        console.error(e);
        setError("Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading leaderboard…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-sm text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 space-y-4">
      <h1 className="text-xl font-semibold text-center mb-2">
        BBOX Leaderboard
      </h1>

      <div className="space-y-3">
        {rows.map((r, index) => (
          <div
            key={r.fid}
            className="rounded-xl border border-gray-800 bg-gray-950/80 p-4 space-y-1"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">#{index + 1}</span>
                <span className="font-medium">
                  {r.username || `fid:${r.fid}`}
                </span>
              </div>
              <span className="text-baseBlue font-semibold">
                {r.total_points ?? 0} pts
              </span>
            </div>

            <div className="text-xs text-gray-400">
              C {r.common_count ?? 0} · R {r.rare_count ?? 0} · E{" "}
              {r.epic_count ?? 0} · L {r.legendary_count ?? 0}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
