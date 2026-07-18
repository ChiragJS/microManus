-- MicroManus database schema (run in Supabase SQL editor)
-- Requires: Supabase project with auth enabled (Google + GitHub providers configured)

-- ============ profiles ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  credits integer not null default 0,
  unlocked boolean not null default false,
  unlock_method text check (unlock_method in ('coupon', 'payment')),
  coupon_redeemed boolean not null default false,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ api_keys ============
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'kimi', 'custom')),
  base_url text not null,
  api_key_encrypted text not null,
  model text not null,          -- model selected when adding the key; pricing follows this model
  label text,
  created_at timestamptz not null default now()
);

alter table public.api_keys enable row level security;
create policy "api_keys_all_own" on public.api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ chats ============
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New research',
  api_key_id uuid references public.api_keys(id) on delete set null,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chats enable row level security;
create policy "chats_all_own" on public.chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ messages ============
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text,
  tool_calls jsonb,        -- OpenAI-format tool_calls emitted by assistant
  tool_call_id text,       -- for role='tool' results
  steps jsonb,             -- agent trace: [{type:'thought'|'tool_call'|'tool_result', ...}]
  artifacts jsonb,         -- [{type:'pdf', name, url, path}]
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  cost numeric(14,8) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists messages_chat_id_idx on public.messages(chat_id, created_at);

alter table public.messages enable row level security;
create policy "messages_all_own" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ credit_events (audit) ============
create table if not exists public.credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  reason text not null,    -- 'coupon' | 'payment' | 'agent_run'
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.credit_events enable row level security;
create policy "credit_events_select_own" on public.credit_events
  for select using (auth.uid() = user_id);

-- ============ RPCs ============

-- Redeem coupon: one-time, unlocks + grants 5 credits
create or replace function public.redeem_coupon(coupon_code text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'Not authenticated');
  end if;
  if coupon_code <> 'SID_DRDROID' then
    return json_build_object('ok', false, 'error', 'Invalid coupon code');
  end if;
  select * into prof from public.profiles where id = uid for update;
  if prof.coupon_redeemed then
    return json_build_object('ok', false, 'error', 'Coupon already redeemed');
  end if;
  update public.profiles
    set credits = credits + 5,
        unlocked = true,
        unlock_method = coalesce(unlock_method, 'coupon'),
        coupon_redeemed = true,
        updated_at = now()
    where id = uid;
  insert into public.credit_events (user_id, delta, reason) values (uid, 5, 'coupon');
  return json_build_object('ok', true, 'credits', prof.credits + 5);
end;
$$;

-- Consume one credit atomically for an agent run. Returns remaining credits or -1 if insufficient.
create or replace function public.consume_credit()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  remaining integer;
begin
  if uid is null then return -1; end if;
  update public.profiles
    set credits = credits - 1, updated_at = now()
    where id = uid and credits > 0 and unlocked = true
    returning credits into remaining;
  if remaining is null then
    return -1;
  end if;
  insert into public.credit_events (user_id, delta, reason) values (uid, -1, 'agent_run');
  return remaining;
end;
$$;

-- ============ storage ============
-- Public bucket for generated PDF artifacts
insert into storage.buckets (id, name, public)
values ('artifacts', 'artifacts', true)
on conflict (id) do nothing;

create policy "artifacts_insert_own" on storage.objects
  for insert with check (bucket_id = 'artifacts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "artifacts_read_public" on storage.objects
  for select using (bucket_id = 'artifacts');
