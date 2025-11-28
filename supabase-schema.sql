create table if not exists public.users (
  fid bigint primary key,
  username text,
  pfp_url text,
  address text,
  is_og boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.user_stats (
  fid bigint primary key references public.users(fid) on delete cascade,
  total_points bigint default 0,
  free_picks_remaining int default 0,
  extra_picks_balance int default 0,
  next_free_refill_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists public.picks (
  id bigserial primary key,
  fid bigint references public.users(fid) on delete cascade,
  points int not null,
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  pick_type text not null check (pick_type in ('free','extra')),
  created_at timestamptz default now()
);

create table if not exists public.payments (
  id bigserial primary key,
  fid bigint references public.users(fid) on delete cascade,
  type text not null check (type in ('og','extra')),
  pack_size int,
  eth_amount numeric,
  tx_hash text,
  status text default 'pending',
  created_at timestamptz default now()
);
