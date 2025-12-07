// src/types/index.ts

export interface ApiUserState {
  fid: number;
  username: string | null;
  pfpUrl: string | null;
  isOg: boolean;
  isPro: boolean;
  totalPoints: number;
  freePicksRemaining: number;
  extraPicksRemaining: number;
  nextFreePickAt: string | null;
  commonOpens: number;
  rareOpens: number;
  epicOpens: number;
  legendaryOpens: number;
}
