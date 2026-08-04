# Stylee MVP Deployment Runbook

本文档汇总 Stylee MVP 部署 / 运维相关的手动步骤，特别是当前 CI 之外**需要有 DB 权限的同学手动执行的动作**。

## 一、Supabase Migration 手动执行清单

由于目前工程师无 Supabase Dashboard 写权限，所有 `supabase/migrations/` 下的 SQL 都需要 PM / DBA 到
Supabase Dashboard → **SQL Editor** 手动跑一次。执行时请按下方**从上到下**的顺序，同一文件仅需执行一次。

| # | 文件 | 用途 | 状态 |
|---|------|------|------|
| 1 | `supabase/migrations/20260804175519_analytics_events.sql` | P0 埋点表 `analytics_events`，承接 `track.ts` 上报 | ⚠️ 未确认执行 |
| 2 | `supabase/migrations/20260804191827_user_feedback.sql` | 意见反馈表 `user_feedback`，承接反馈页 handleSubmit | ⚠️ 未确认执行 |

### 执行方法

1. 打开 Supabase Dashboard，选择本项目
2. 进入 **SQL Editor** → New query
3. 复制对应 SQL 文件全文，粘贴执行
4. 到 **Table Editor** 验证：`analytics_events` / `user_feedback` 两张表已创建，且 RLS 开启

### 未执行时的降级行为

- **`analytics_events` 未建**：客户端 `track()` 会静默降级到 `console.info`，业务不受影响，但埋点数据丢失。
- **`user_feedback` 未建**：反馈页提交时 `supabase.from('user_feedback').insert()` 会返回 error，
  toast 展示"提交失败，请稍后重试"，表单内容保留。**这是符合预期的失败态**，不会崩溃或误伤埋点
  （埋点 `feedback_submit` 只在成功入库后才上报）。

## 二、前端部署

- 构建命令：`npm run build:web`（会调用 `expo export --platform web` + `patch-html.js`）
- 检查命令（TS + Design System）：`npm run check`
- 产物目录：`dist/`
- 部署平台：Vercel（配置见根目录 `vercel.json`）

## 三、埋点验证

上线后请到 Supabase Dashboard 检查：

```sql
select event_name, count(*) from public.analytics_events
where ts > now() - interval '1 day'
group by 1 order by 2 desc;
```

期望能看到 `feedback_submit`、`outfit_generate_click`、`filter_conflict_shown` 等事件。
