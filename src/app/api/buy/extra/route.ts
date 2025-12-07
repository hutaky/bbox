// src/app/api/buy/extra/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  // Ideiglenesen letiltjuk a vásárlást, hogy ne dobjon build hibát.
  return NextResponse.json(
    {
      error:
        "Extra pick purchases are temporarily disabled in this build. Please contact the admin if you need more picks.",
    },
    { status: 503 }
  );
}
