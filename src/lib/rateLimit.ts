// src/lib/rateLimit.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RateLimitOpts = {
  ipLimit: number;
  fidLimit: number;
  windowSeconds: number;
  action: string; // pl. "pick" | "pay_extra"
  fid?: number | null;
};

function getClientIp(req: Request): string {
  // Vercel: x-forwarded-for: "ip, proxy1, proxy2"
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // fallback: "unknown" (nem tökéletes, de jobb mint semmi)
  return "unknown";
}

async function checkKey(key: string, limit: number, windowSeconds: number) {
  const { data, error } = await supabaseAdmin.rpc("rate_limit_check", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // ha a rate-limit infra hibázik, inkább engedjük tovább (ne álljon le az app)
    console.warn("rate_limit_check rpc error:", error.message);
    return { ok: true, remaining: null as number | null };
  }

  // rpc json: { ok: boolean, remaining: number }
  const ok = Boolean(data?.ok);
  const remaining = typeof data?.remaining === "number" ? data.remaining : null;
  return { ok, remaining };
}

export async function enforceRateLimit(req: Request, opts: RateLimitOpts) {
  const ip = getClientIp(req);

  // IP limit
  const ipKey = `ip:${opts.action}:${ip}`;
  const ipRes = await checkKey(ipKey, opts.ipLimit, opts.windowSeconds);
  if (!ipRes.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded (ip)", action: opts.action },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          ...(ipRes.remaining !== null ? { "X-RateLimit-Remaining-IP": String(ipRes.remaining) } : {}),
        },
      }
    );
  }

  // FID limit (ha van fid)
  if (opts.fid && Number.isFinite(opts.fid) && opts.fid > 0) {
    const fidKey = `fid:${opts.action}:${opts.fid}`;
    const fidRes = await checkKey(fidKey, opts.fidLimit, opts.windowSeconds);
    if (!fidRes.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded (fid)", action: opts.action },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            ...(fidRes.remaining !== null ? { "X-RateLimit-Remaining-FID": String(fidRes.remaining) } : {}),
          },
        }
      );
    }
  }

  return null; // ok
}
