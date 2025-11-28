# BBOX – Daily Based Box MiniApp (MVP)

This repo contains a minimal, production-ready Next.js app for the BBOX game:
- Daily free + extra box openings
- Random rarity and points
- OG rank flag
- Supabase-backed data

## 1. Supabase setup

1. Create a new Supabase project at https://supabase.com.
2. Go to **SQL** → **New query**.
3. Paste the contents of `supabase-schema.sql` and run it.
4. Note your:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → Service role key).

## 2. GitHub repo

1. Download this project, unzip it.
2. Create a new GitHub repository.
3. Copy *all files* (including package.json, next.config.mjs, src/, supabase-schema.sql, README-BBOX.md, etc.) into the repo root.
4. Commit & push.

## 3. Deploy on Vercel

1. Go to https://vercel.com → New Project → Import your GitHub repo.
2. Framework preset: **Next.js**.
3. Build command: `next build`.
4. Output directory: `.next`.

### Environment variables (Vercel → Project → Settings → Environment Variables)

Set:

- `NEXT_PUBLIC_SUPABASE_URL` → from Supabase
- `SUPABASE_SERVICE_ROLE_KEY` → from Supabase
- `BBOX_TREASURY_ADDRESS` → your Base ETH address
- `BBOX_OG_PRICE_ETH` → e.g. `0.0017`
- `BBOX_PACK1_PRICE_ETH` → e.g. `0.0002`
- `BBOX_PACK5_PRICE_ETH` → e.g. `0.0007`
- `BBOX_PACK10_PRICE_ETH` → e.g. `0.0012`

Then redeploy.

## 4. Running locally (optional)

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## 5. FID handling

Right now, `src/app/page.tsx` uses a placeholder:

```ts
const fid = 123456;
```

For a real Farcaster MiniApp, replace this with the FID coming from your MiniKit / Neynar integration, and forward it to the API endpoints using headers or another secure mechanism.

Endpoints:

- `GET /api/me` – current user state
- `POST /api/pick` – open a box
- `GET /api/leaderboard` – top users
- `POST /api/buy/og` – set OG rank (after ETH payment)
- `POST /api/buy/extra` – add extra picks (after ETH payment)
