// src/types.ts

// Ez a típus írja le, mit küld vissza az /api/me endpoint
// és mit tárolunk a főoldalon user state-ként.

export interface ApiUserState {
  fid: number;
  username: string | null;
  pfpUrl: string | null;

  // OG rang
  isOg: boolean;

  // Pontok és pickek
  totalPoints: number;
  freePicksRemaining: number;
  extraPicksRemaining: number;

  // Következő free pick ideje (ISO string vagy null, ha "Ready")
  nextFreePickAt: string | null;

  // Box statok a leaderboardhoz
  commonOpens: number;
  rareOpens: number;
  epicOpens: number;
  legendaryOpens: number;

  // Opcionális, ha az /api/me visszaküldi az utolsó nyitás eredményét
  lastResult?: {
    rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
    points: number;
    openedAt: string;
  };
}
