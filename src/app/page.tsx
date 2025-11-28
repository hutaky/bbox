"use client";

import { useEffect, useState } from "react";
import type { ApiUserState } from "@/types";
import sdk from "@farcaster/frame-sdk";

type PickResult = {
  rarity: "common" | "rare" | "epic" | "legendary";
  points: number;
};

function formatCountdown(targetIso: string | null): string | null {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return "00:00:00";
  const totalSeconds = Math.floor(diff / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function HomePage() {
  const [user, setUser] = useState<ApiUserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [lastResult, setLastResult] = useState<PickResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [fid, setFid] = useState<number | null>(null);
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);

  // Farcaster SDK inicializálás
  useEffect(() => {
    const load = async () => {
      try {
        await sdk.actions.ready();
        const context = await sdk.context;
        
        if (context?.user?.fid) {
          setFid(context.user.fid);
        } else {
          // Fallback lokális fejlesztéshez
          setFid(123456);
        }
        
        setIsSDKLoaded(true);
      } catch (err) {
        console.error("Farcaster SDK error:", err);
        // Fallback
        setFid(123456);
        setIsSDKLoaded(true);
      }
    };
    
    load();
  }, []);

  async function loadState() {
    if (!fid) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        headers: {
          "x-bbox-fid": String(fid)
        }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load state");
      } else {
        setUser(data);
        if (data.nextFreeRefillAt && data.freePicksRemaining === 0 && data.extraPicksBalance === 0) {
          setCountdown(formatCountdown(data.nextFreeRefillAt));
        } else {
          setCountdown(null);
        }
      }
    } catch (e: any) {
      console.error(e);
      setError("Failed to load state");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fid && isSDKLoaded) {
      loadState();
    }
  }, [fid, isSDKLoaded]);

  useEffect(() => {
    let timer: any;
    if (user && user.nextFreeRefillAt && user.freePicksRemaining === 0 && user.extraPicksBalance === 0) {
      timer = setInterval(() => {
        const text = formatCountdown(user.nextFreeRefillAt);
        setCountdown(text);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [user]);

  async function handlePick() {
    if (!user || !fid) return;
    if (picking) return;
    setPicking(true);
    setError(null);
    try {
      const res = await fetch("/api/pick", {
        method: "POST",
        headers: {
          "x-bbox-fid": String(fid)
        }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to pick");
        if (data.nextFreeRefillAt) {
          setUser(prev =>
            prev
              ? {
                  ...prev,
                  freePicksRemaining: 0,
                  extraPicksBalance: 0,
                  nextFreeRefillAt: data.nextFreeRefillAt
                }
              : prev
          );
        }
      } else {
        const updated: ApiUserState = {
          fid: user.fid,
          username: user.username,
          isOg: user.isOg,
          totalPoints: data.totalPoints,
          freePicksRemaining: data.freePicksRemaining,
          extraPicksBalance: data.extraPicksBalance,
          nextFreeRefillAt: data.nextFreeRefillAt
        };
        setUser(updated);
        setLastResult({ rarity: data.rarity, points: data.points });
      }
    } catch (e: any) {
      console.error(e);
      setError("Failed to pick");
    } finally {
      setPicking(false);
    }
  }

  const canPick =
    user &&
    (user.freePicksRemaining > 0 || user.extraPicksBalance > 0);

  if (!isSDKLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading Farcaster...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* ... többi JSX ugyanaz marad ... */}
    </main>
  );
}