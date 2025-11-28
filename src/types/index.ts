export type ApiUserState = {
  fid: number;
  username: string | null;
  isOg: boolean;
  totalPoints: number;
  freePicksRemaining: number;
  extraPicksBalance: number;
  nextFreeRefillAt: string | null;
};
