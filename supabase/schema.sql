-- Hank Sales OS canonical schema. Safe to run repeatedly in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.agent_settings (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default true,
  daily_search_limit integer not null default 6,
  daily_cost_limit_usd numeric(10,4) not null default 1,
  max_results_per_query integer not null default 5,
  min_lead_score integer not null default 55,
  target_markets jsonb not null default '["韓國", "日本", "香港", "澳門"]'::jsonb,
  target_types jsonb not null default '["EA 開發者", "交易社群主", "IB", "金融內容創作者"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agent_settings add column if not exists enabled boolean not null default true;
alter table public.agent_settings add column if not exists daily_search_limit integer not null default 6;
alter table public.agent_settings add column if not exists daily_cost_limit_usd numeric(10,4) not null default 1;
alter table public.agent_settings add column if not exists max_results_per_query integer not null default 5;
alter table public.agent_settings add column if not exists min_lead_score integer not null default 55;
alter table public.agent_settings add column if not exists target_markets jsonb not null default '["韓國", "日本", "香港", "澳門"]'::jsonb;
alter table public.agent_settings alter column target_markets set default '["韓國", "日本", "香港", "澳門"]'::jsonb;
alter table public.agent_settings add column if not exists target_types jsonb not null default '["EA 開發者", "交易社群主", "IB", "金融內容創作者"]'::jsonb;
alter table public.agent_settings add column if not exists created_at timestamptz not null default now();
alter table public.agent_settings add column if not exists updated_at timestamptz not null default now();
update public.agent_settings
set target_markets = '["韓國", "日本", "香港", "澳門"]'::jsonb,
    updated_at = now()
where target_markets in ('["韓國", "日本"]'::jsonb, '["日本", "韓國"]'::jsonb);

create table if not exists public.search_runs (
  id uuid primary key default gen_random_uuid(),
  market text not null,
  target text not null,
  strategies jsonb not null default '[]'::jsonb,
  status text not null default 'planned',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result_count integer not null default 0,
  candidate_count integer not null default 0,
  new_lead_count integer not null default 0,
  draft_count integer not null default 0,
  search_count integer not null default 0,
  estimated_cost_usd numeric(10,6) not null default 0,
  daily_search_limit integer,
  daily_cost_limit_usd numeric(10,4),
  error_message text,
  logs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.search_runs add column if not exists started_at timestamptz not null default now();
alter table public.search_runs add column if not exists completed_at timestamptz;
alter table public.search_runs add column if not exists result_count integer not null default 0;
alter table public.search_runs add column if not exists candidate_count integer not null default 0;
alter table public.search_runs add column if not exists new_lead_count integer not null default 0;
alter table public.search_runs add column if not exists draft_count integer not null default 0;
alter table public.search_runs add column if not exists search_count integer not null default 0;
alter table public.search_runs add column if not exists estimated_cost_usd numeric(10,6) not null default 0;
alter table public.search_runs add column if not exists daily_search_limit integer;
alter table public.search_runs add column if not exists daily_cost_limit_usd numeric(10,4);
alter table public.search_runs add column if not exists error_message text;
alter table public.search_runs add column if not exists logs jsonb not null default '[]'::jsonb;

create table if not exists public.search_results (
  id uuid primary key default gen_random_uuid(),
  search_run_id uuid references public.search_runs(id) on delete set null,
  query text not null,
  title text,
  url text not null,
  canonical_url text not null unique,
  content text,
  provider_score numeric,
  market text,
  platform text,
  is_candidate boolean not null default false,
  rejection_reason text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.search_results add column if not exists search_run_id uuid references public.search_runs(id) on delete set null;
alter table public.search_results add column if not exists query text;
alter table public.search_results add column if not exists title text;
alter table public.search_results add column if not exists url text;
alter table public.search_results add column if not exists canonical_url text;
alter table public.search_results add column if not exists content text;
alter table public.search_results add column if not exists provider_score numeric;
alter table public.search_results add column if not exists market text;
alter table public.search_results add column if not exists platform text;
alter table public.search_results add column if not exists is_candidate boolean not null default false;
alter table public.search_results add column if not exists rejection_reason text;
alter table public.search_results add column if not exists raw_data jsonb not null default '{}'::jsonb;
alter table public.search_results add column if not exists created_at timestamptz not null default now();

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  search_run_id uuid references public.search_runs(id) on delete set null,
  name text,
  handle text,
  normalized_handle text,
  account_key text,
  profile_url text unique,
  country text,
  platform text,
  summary text,
  recent_content text,
  pain_points jsonb not null default '[]'::jsonb,
  score integer not null default 0 check (score between 0 and 100),
  suggested_message text,
  message_language text,
  stage text not null default '待審核',
  source_query text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads add column if not exists search_run_id uuid references public.search_runs(id) on delete set null;
alter table public.leads add column if not exists normalized_handle text;
alter table public.leads add column if not exists account_key text;
alter table public.leads add column if not exists message_language text;

create table if not exists public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  search_run_id uuid references public.search_runs(id) on delete set null,
  language text not null,
  purpose text not null default 'first_contact',
  body text not null,
  status text not null default 'pending_approval',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.message_drafts add column if not exists search_run_id uuid references public.search_runs(id) on delete set null;
alter table public.message_drafts add column if not exists lead_id uuid references public.leads(id) on delete cascade;
alter table public.message_drafts add column if not exists language text;
alter table public.message_drafts add column if not exists purpose text not null default 'first_contact';
alter table public.message_drafts add column if not exists body text;
alter table public.message_drafts add column if not exists status text not null default 'pending_approval';
alter table public.message_drafts add column if not exists created_at timestamptz not null default now();
alter table public.message_drafts add column if not exists updated_at timestamptz not null default now();

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  search_run_id uuid references public.search_runs(id) on delete set null,
  type text not null,
  details jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.activities add column if not exists search_run_id uuid references public.search_runs(id) on delete set null;
alter table public.activities add column if not exists lead_id uuid references public.leads(id) on delete cascade;
alter table public.activities add column if not exists type text;
alter table public.activities add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.activities add column if not exists due_at timestamptz;
alter table public.activities add column if not exists completed_at timestamptz;
alter table public.activities add column if not exists created_at timestamptz not null default now();

create unique index if not exists search_results_canonical_url_uidx on public.search_results(canonical_url);
create unique index if not exists leads_profile_url_uidx on public.leads(profile_url) where profile_url is not null;
create index if not exists leads_account_key_idx on public.leads(account_key) where account_key is not null;
create index if not exists leads_score_idx on public.leads(score desc);
create index if not exists leads_stage_idx on public.leads(stage);
create index if not exists search_runs_started_at_idx on public.search_runs(started_at desc);
create index if not exists message_drafts_status_idx on public.message_drafts(status, created_at desc);

insert into public.agent_settings (enabled)
select true
where not exists (select 1 from public.agent_settings);

alter table public.agent_settings enable row level security;
alter table public.search_runs enable row level security;
alter table public.search_results enable row level security;
alter table public.leads enable row level security;
alter table public.message_drafts enable row level security;
alter table public.activities enable row level security;

-- Serverless functions authenticate with SUPABASE_SERVICE_ROLE_KEY.
-- Browser roles receive no direct table grants; dashboard reads go through protected APIs.
grant select, insert, update, delete on table public.agent_settings to service_role;
grant select, insert, update, delete on table public.search_runs to service_role;
grant select, insert, update, delete on table public.search_results to service_role;
grant select, insert, update, delete on table public.leads to service_role;
grant select, insert, update, delete on table public.message_drafts to service_role;
grant select, insert, update, delete on table public.activities to service_role;
