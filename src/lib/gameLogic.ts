export type Rarity = "common" | "rare" | "epic" | "legendary";

export function rollRarity(): Rarity {
  const r = Math.random();
  if (r < 0.65) return "common";
  if (r < 0.90) return "rare";
  if (r < 0.98) return "epic";
  return "legendary";
}

export function rollPoints(rarity: Rarity): number {
  if (rarity === "common") return randInt(5, 50);
  if (rarity === "rare") return randInt(50, 200);
  if (rarity === "epic") return randInt(200, 350);
  return randInt(350, 500);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function getDailyFreePicks(isOg: boolean): number {
  return isOg ? 2 : 1;
}
