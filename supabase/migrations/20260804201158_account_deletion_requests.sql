create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  reason text,
  status text default 'pending', -- pending | processing | completed | cancelled
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_deletion_req_status on public.account_deletion_requests(status);

alter table public.account_deletion_requests enable row level security;

create policy "allow user insert own request" on public.account_deletion_requests for insert with check (auth.uid() = user_id);
create policy "allow user read own request" on public.account_deletion_requests for select using (auth.uid() = user_id);
