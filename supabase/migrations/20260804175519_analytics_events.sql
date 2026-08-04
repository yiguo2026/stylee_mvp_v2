-- Stylee MVP 埋点数据表
-- 用于存储客户端上报的用户行为事件，服务推荐质量评测和业务漏斗分析

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid,
  anonymous_id text,
  session_id text,
  platform text,
  app_version text,
  params jsonb default '{}'::jsonb,
  ts timestamptz not null default now()
);

create index if not exists idx_analytics_events_event_ts on public.analytics_events(event_name, ts desc);
create index if not exists idx_analytics_events_user_ts on public.analytics_events(user_id, ts desc);

-- RLS: 允许所有已登录用户 insert，只允许 service_role 读
alter table public.analytics_events enable row level security;

create policy "allow insert for authenticated" on public.analytics_events
  for insert with check (true);

create policy "allow insert for anon" on public.analytics_events
  for insert with check (true);
