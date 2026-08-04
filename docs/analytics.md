# Stylee MVP 埋点事件字典

> 版本: v1.0 | 更新: 2026-08-04 | 维护人: 马思雨

## 公用字段（所有事件自动携带）

| 字段 | 类型 | 说明 |
|------|------|------|
| `user_id` | uuid | 已登录用户的 Supabase Auth UID，未登录为 null |
| `anonymous_id` | text | 匿名设备标识（localStorage UUID），用于未登录行为归因 |
| `session_id` | text | 本次 app 会话标识（每次启动生成一次） |
| `ts` | timestamptz | 事件产生时间（ISO 8601） |
| `platform` | text | `web` / `ios` / `android` |
| `app_version` | text | Expo Constants version |

---

## 12 个 MVP 核心事件

### 【认证漏斗】

#### 1. `auth_view` — 进入登录/注册页

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | `'login' \| 'register'` | 所在页面 |

#### 2. `auth_success` — 登录/注册成功

| 参数 | 类型 | 说明 |
|------|------|------|
| `mode` | `'login' \| 'register'` | 操作模式 |
| `is_new_user` | boolean | 是否新注册用户 |

---

### 【衣橱漏斗】

#### 3. `wardrobe_view` — 进入衣橱页

| 参数 | 类型 | 说明 |
|------|------|------|
| `item_count` | number | 当前衣橱单品总数 |

#### 4. `wardrobe_import_start` — 开始导入单品

| 参数 | 类型 | 说明 |
|------|------|------|
| `source` | `'camera' \| 'album' \| 'outfit_split'` | 导入来源 |

#### 5. `wardrobe_import_result` — 导入结果

| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | `'success' \| 'failed' \| 'multi_selection'` | 导入结果状态 |
| `item_count` | number | 成功导入/识别件数 |
| `duration_ms` | number | 导入耗时（毫秒） |
| `error_code` | string? | 失败时的错误码 |

---

### 【生成漏斗——核心】

#### 6. `outfit_generate_click` — 点击"生成穿搭"

| 参数 | 类型 | 说明 |
|------|------|------|
| `query_type` | `'scene' \| 'style' \| 'item' \| 'mood' \| 'iterate'` | 生成方式 |
| `query_text` | string? | 用户输入的描述/选中的标签 |

#### 7. `outfit_generate_result` — 生成完成

| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | `'success' \| 'failed' \| 'timeout'` | 生成结果 |
| `duration_ms` | number | 生成耗时（毫秒） |
| `item_count` | number | 方案中单品件数 |
| `error_code` | string? | 失败时错误原因 |

#### 8. `outfit_preview_duration` — 预览穿搭结果的停留时长

| 参数 | 类型 | 说明 |
|------|------|------|
| `outfit_id` | string | 搭配方案 ID |
| `duration_ms` | number | 停留时长（毫秒） |
| `exited_by` | `'back' \| 'save' \| 'regenerate' \| 'change_item'` | 离开方式 |

---

### 【生成结果反馈——9.3 关键信号】

#### 9. `outfit_action` — 用户对生成结果的动作

| 参数 | 类型 | 说明 |
|------|------|------|
| `outfit_id` | string | 搭配方案 ID |
| `action` | `'save' \| 'like' \| 'dislike' \| 'regenerate' \| 'change_item' \| 'try_on'` | 具体动作 |

> 一个事件覆盖所有反馈信号："就这么穿"=save、"换一套"=regenerate、"稍作调整"=change_item、"收藏"=like、"AI试穿"=try_on

#### 10. `outfit_detail_view` — 查看穿搭详情/单品拆解

| 参数 | 类型 | 说明 |
|------|------|------|
| `outfit_id` | string | 搭配方案 ID |
| `source` | `'record' \| 'collection' \| 'generate'` | 来源页面 |

---

### 【留存漏斗】

#### 11. `record_view` — 进入记录/收藏页

| 参数 | 类型 | 说明 |
|------|------|------|
| `tab` | `'record' \| 'collection'` | 当前 tab |
| `item_count` | number | 已有搭配记录总数 |

#### 12. `feedback_submit` — 提交意见反馈

| 参数 | 类型 | 说明 |
|------|------|------|
| `category` | string? | 反馈分类 |
| `has_screenshot` | boolean | 是否附带截图 |

---

## Supabase 查询示例

### 过去 7 天生成漏斗转化率

```sql
-- 1. 点击生成 → 生成成功 转化
WITH clicks AS (
  SELECT count(*) AS cnt FROM analytics_events
  WHERE event_name = 'outfit_generate_click'
    AND ts > now() - interval '7 days'
),
results AS (
  SELECT count(*) AS cnt FROM analytics_events
  WHERE event_name = 'outfit_generate_result'
    AND params->>'status' = 'success'
    AND ts > now() - interval '7 days'
),
saves AS (
  SELECT count(*) AS cnt FROM analytics_events
  WHERE event_name = 'outfit_action'
    AND params->>'action' = 'save'
    AND ts > now() - interval '7 days'
)
SELECT
  clicks.cnt AS total_clicks,
  results.cnt AS total_success,
  saves.cnt AS total_saves,
  round(results.cnt::numeric / nullif(clicks.cnt, 0), 3) AS gen_success_rate,
  round(saves.cnt::numeric / nullif(results.cnt, 0), 3) AS save_rate
FROM clicks, results, saves;
```

### outfit_action 各动作分布

```sql
SELECT
  params->>'action' AS action,
  count(*) AS cnt,
  round(count(*)::numeric / sum(count(*)) over(), 3) AS ratio
FROM analytics_events
WHERE event_name = 'outfit_action'
  AND ts > now() - interval '7 days'
GROUP BY 1
ORDER BY cnt DESC;
```

### 日活跃用户数（DAU）

```sql
SELECT
  date_trunc('day', ts) AS day,
  count(DISTINCT coalesce(user_id::text, anonymous_id)) AS dau
FROM analytics_events
WHERE ts > now() - interval '30 days'
GROUP BY 1
ORDER BY 1;
```

### 注册→完成 Onboarding→首次生成 全链路转化

```sql
WITH reg AS (
  SELECT count(DISTINCT user_id) AS cnt FROM analytics_events
  WHERE event_name = 'auth_success' AND params->>'mode' = 'register'
    AND ts > now() - interval '7 days'
),
wardrobe AS (
  SELECT count(DISTINCT user_id) AS cnt FROM analytics_events
  WHERE event_name = 'wardrobe_view'
    AND ts > now() - interval '7 days'
    AND user_id IN (
      SELECT user_id FROM analytics_events
      WHERE event_name = 'auth_success' AND params->>'mode' = 'register'
        AND ts > now() - interval '7 days'
    )
),
gen AS (
  SELECT count(DISTINCT user_id) AS cnt FROM analytics_events
  WHERE event_name = 'outfit_generate_click'
    AND ts > now() - interval '7 days'
    AND user_id IN (
      SELECT user_id FROM analytics_events
      WHERE event_name = 'auth_success' AND params->>'mode' = 'register'
        AND ts > now() - interval '7 days'
    )
)
SELECT
  reg.cnt AS registered,
  wardrobe.cnt AS saw_wardrobe,
  gen.cnt AS first_generate,
  round(wardrobe.cnt::numeric / nullif(reg.cnt, 0), 3) AS reg_to_wardrobe,
  round(gen.cnt::numeric / nullif(reg.cnt, 0), 3) AS reg_to_generate
FROM reg, wardrobe, gen;
```

### 平均预览停留时长 (outfit_preview_duration)

```sql
SELECT
  params->>'exited_by' AS exit_action,
  count(*) AS cnt,
  round(avg((params->>'duration_ms')::numeric / 1000), 1) AS avg_seconds
FROM analytics_events
WHERE event_name = 'outfit_preview_duration'
  AND ts > now() - interval '7 days'
GROUP BY 1
ORDER BY cnt DESC;
```

---

## 数据消费方

- **推荐质量评测（9.3）**：outfit_action 分布（save/like vs regenerate/change_item 比例）、preview_duration 均值
- **增长 PM**：认证漏斗 auth_view→auth_success 转化率、新用户次日留存
- **产品体验**：wardrobe_import 成功率、生成耗时分布、feedback 分类统计
