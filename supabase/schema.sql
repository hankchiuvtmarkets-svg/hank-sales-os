create extension if not exists pgcrypto;

create table if not exists search_runs (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  target text not null,
  strategies jsonb not null default '[]'::jsonb,
  status text not null default 'planned',
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  handle text,
  profile_url text unique,
  country text,
  platform text,
  summary text,
  recent_content text,
  pain_points jsonb not null default '[]'::jsonb,
  score integer not null default 0 check (score between 0 and 100),
  suggested_message text,
  stage text not null default '待審核',
  source_query text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_score_idx on leads(score desc);
create index if not exists leads_stage_idx on leads(stage);
