-- Stylee MVP 意见反馈表
-- 存储用户在「意见反馈」页提交的反馈内容
-- - 允许匿名（未登录）用户提交，通过 anonymous_id 兜底
-- - 允许所有客户端 insert；只允许作者本人（登录态）read；后台运营通过 service_role 全量读写

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,          -- 未登录用户匿名 id（沿用 analytics_events 的 anonymous_id 生成逻辑）
  category text,              -- 反馈类型：bug / idea / ai / account / other（不做数据库枚举约束，兼容后续扩展）
  content text not null,      -- 反馈正文
  contact text,               -- 联系方式（可选）
  screenshot_url text,        -- 截图 URL（MVP 阶段暂未启用）
  app_version text,           -- 版本号
  platform text,              -- web / ios / android
  status text default 'new',  -- 处理状态：new / reviewing / resolved / closed，供后台运营用
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_feedback_created on public.user_feedback(created_at desc);
create index if not exists idx_user_feedback_status on public.user_feedback(status);
create index if not exists idx_user_feedback_user on public.user_feedback(user_id);

-- RLS: 允许任何人 insert（含未登录），登录用户只可读自己提交的记录
alter table public.user_feedback enable row level security;

create policy "allow insert for all" on public.user_feedback
  for insert with check (true);

create policy "allow user read own" on public.user_feedback
  for select using (auth.uid() = user_id);
