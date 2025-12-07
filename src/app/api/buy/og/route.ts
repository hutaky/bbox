// src/app/api/buy/og/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  // Ideiglenesen letiltjuk az OG vásárlást is.
  return NextResponse.json(
    {
      error:
        "OG upgrades are temporarily disabled in this build. Please contact the admin if you need an OG upgrade.",
    },
    { status: 503 }
  );
}
