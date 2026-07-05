# Stylee — AI 穿搭推荐 MVP

基于 Expo (React Native) + Supabase 的智能穿搭推荐应用，支持 Web / iOS / Android。

**在线体验：** https://yiguo2026.github.io/

**本地体验：** `npx expo start --web` 后访问 http://localhost:8081

## 技术栈

- **前端**：Expo SDK 54 + TypeScript + Expo Router（文件路由）
- **后端**：Supabase（Auth / PostgreSQL / Storage / RLS）
- **天气**：和风天气 API（QWeather 商业版，实时天气数据，15 分钟缓存，55 城市本地 ID 映射 + GeoAPI 远程搜索，自动 fallback 到本地 mock）
- **AI**：DashScope（Qwen VL 识别 / Qwen Image 生图）+ DeepSeek（意图识别 / 穿搭推荐 / 试穿建议）；不可用时自动回落 mock
- **部署**：GitHub Pages（gh-pages）+ EAS Build（iOS）
- **状态管理**：Zustand
- **样式**：Editorial Mark v3.6（冷调中性黑白体系 / 统一字体体系 / 过程态规范）

## 功能

### 用户系统
- 注册 / 登录（Supabase Auth，邮箱密码）
- 个人资料编辑（头像上传、昵称、性别、年龄、城市、职业）
- 更多设置（通知开关、账号安全、隐私、数据管理、关于）

### Onboarding 引导（3步）
- Step1：个人信息（昵称、性别、年龄、职业、城市搜索选择）
- Step2：风格偏好（19个喜欢标签，点击选择）
- Step3：初始化衣橱（15件AI推荐基础款 + 相册批量导入，可同时选择两类，真实服装图片）

### 首页
- 穿搭灵感卡片（竖版图片，点击进入灵感详情页）
- 灵感详情页（大图展示 + 风格标签 + 单品拆解模块）
- 天气信息 + 快捷穿搭入口

### 衣橱管理
- 紧凑分类标签（上装/下装/连体装/外套/鞋履/包袋/帽巾/配饰，带数量角标）
- 模糊搜索（支持同义词匹配，如"裤子"→下装/阔腿裤/短裤）
- 单品详情查看 + 编辑（照片、名称、分类、颜色、材质、品牌、价格）
- 单品删除（自定义 ConfirmModal，Web 兼容）
- 心愿单（页面底部粉色入口卡片，全屏弹窗展示）
- 快速添加入口（虚线边框卡片）

### 穿搭推荐
- 实时天气卡片（和风天气 API，55 城市本地 ID 映射 + GeoAPI 远程搜索，自动匹配温度标签）
- 自然语言输入（DeepSeek 意图识别，自动匹配标签）
- 场合/风格/色系/温度标签筛选（场合10个、风格19个、色系8个、温度4个）
- AI 穿搭推荐（DeepSeek 生成搭配方案 + AI评论）
- AI 结果页模型来源 banner（✓ 真实模型·耗时 / ✗ 结果不可用·已降级 / ⚠ mock）
- 穿搭结果：方案展示、AI点评、收藏、单品替换
- 穿搭历史记录

### AI 试穿
- 身体信息录入（自拍上传至 Supabase Storage，持久化到 user_body_models 表，跨设备跨会话保留）
- 两种入口流程：
  - 首页入口：身体信息 → 选择搭配方案（已穿搭配/收藏搭配 Tab） → 选择场景 → 生成
  - 推荐结果入口：身体信息 → 搭配单品（已选） → 选择场景 → 生成
- 场景风格选择（☕咖啡馆/🏙️街道/💼办公室/🌿公园/🏠居家）
- 等待过程态（1%-99% 进度条 + 4 步清单 + 呼吸闪烁动画：分析身体数据→匹配单品→合成效果→优化细节）
- AI 试穿图生成（qwen-image-2.0-pro）+ 搭配建议（deepseek-v4-flash，含契合度评分、穿搭建议、风格小贴士）
- 效果图展示 + 保存（AI 生成失败时 fallback 到预置场景图）
- 每日使用次数限制（10次/天，客户端 AsyncStorage 计数）

### Web 兼容
- ConfirmModal 替代 Alert.alert 多按钮弹窗
- Web 端不喜欢按钮替代 onLongPress
- PlayfairDisplay 字体跨平台统一
- useWindowDimensions 响应式布局
- 图片上传 blob URL 扩展名处理

## 数据库

11 张表 + 2 个 Storage bucket，全部启用 RLS：

| 表 | 用途 |
|---|---|
| `users` | 用户资料（含 avatar_url、body_shape） |
| `tags` | 风格标签（19个风格偏好标签） |
| `user_style_preferences` | 用户风格偏好（仅 like） |
| `wardrobe_items` | 衣橱单品（多图、季节、场合、版型、购买日期） |
| `outfits` | 穿搭组合（风格标签、场合、温度范围、试穿图） |
| `outfit_items` | 穿搭-衣橱关联 |
| `outfit_favorites` | 收藏搭配 |
| `wishlist_items` | 心愿单 |
| `inspiration_cards` | 穿搭灵感卡片 |
| `user_body_models` | AI试穿身体信息 |
| `wear_events` | 穿着记录 |
| Storage `wardrobe-images` | 衣物/头像图片（公开读） |
| Storage `body-photos` | AI试穿照片（私有） |

## 快速开始

```bash
npm install
cp .env.example .env   # 填入以下配置
npx expo start
```

### 环境变量

| 变量 | 说明 | 获取方式 |
|------|------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | Supabase Dashboard |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | Supabase Dashboard |
| `EXPO_PUBLIC_QWEATHER_KEY` | 和风天气 API Key（可选） | [dev.qweather.com](https://dev.qweather.com/) |
| `EXPO_PUBLIC_QWEATHER_HOST` | 和风天气 API Host（商业版需自定义） | QWeather 控制台 |
| `EXPO_PUBLIC_DASHSCOPE_API_KEY` | DashScope API Key（Qwen VL / Qwen Image，推荐） | DashScope 控制台 |
| `EXPO_PUBLIC_DEEPSEEK_KEY` | DeepSeek API Key（可选） | [platform.deepseek.com](https://platform.deepseek.com/) |
| `EXPO_PUBLIC_DEEPSEEK_HOST` | DeepSeek API Host（可选，默认 api.deepseek.com） | — |
| `EXPO_PUBLIC_SUPABASE_SERVICE_KEY` | Supabase Service Role Key | Supabase Dashboard |

> 不配置 `EXPO_PUBLIC_QWEATHER_KEY` 时，天气数据将使用本地 mock 数据；不配置 `EXPO_PUBLIC_DASHSCOPE_API_KEY` / `EXPO_PUBLIC_DEEPSEEK_KEY` 时，AI 功能会自动回落到 mock/预置结果（不影响衣橱、记录等基础功能）。

### iOS 构建

```bash
npm run prebuild:ios      # prebuild + 隐私声明补丁
npx expo run:ios          # 本地模拟器运行
# 或使用 EAS 云构建（需先 eas login + eas build --platform ios）
```

### Web 部署

```bash
npm run build:web        # 构建到 dist/（含 post-build patch）
```

- 仓库已配置 GitHub Actions：push 到 `main` 后自动构建并发布到 GitHub Pages。
- 在线地址：https://yiguo2026.github.io/

选择 Web / iOS 模拟器 / Android 模拟器运行。

## 开发历程

| Commit | 说明 |
|---|---|
| `99360c4` | 项目初始化 |
| `d482a7b` | MVP 可运行版本：注册登录、衣橱、推荐 |
| `53307df` | 修复注册流程、标签冲突、onboarding；新增图片上传 |
| `9d5affc` | 修复 INITIAL_SESSION 无 session 时卡 loading |
| `e7ba8ae` | 修复注册/登录后无法跳转 |
| `4b7e1cd` | 修复注册无反应，加 try/catch 兜底 |
| `ab80bda` | Supabase 改用原生 fetch，解决 iOS XHR 网络错误 |
| `8cc10be` | 新增衣橱搜索、穿搭历史、稍作调整功能 |
| `908b31b` | 重复邮箱注册给出明确提示 |
| `adc533c` | 字体规范 + 配色规范 + 图标系统全面升级 |
| `c862988` | v0.2.0：修复 6 个代码缺陷 + Web 运行适配 |
| `1256d47` | 修复推荐结果页衣橱数据闭包陷阱（BUG-08） |
| `94d3dec` | v0.2.1：Web BLOCKER 修复（onLongPress/Alert/拍照/字体/Dimensions） |
| `9df0751` | v0.3.0：5个功能按原型实现（编辑资料/城市搜索/设置页/Step3/编辑页/批量导入/推荐单品） |
| `c16bc76` | v0.3.1：5个Bug修复（批量导入可用/头像上传/标签统一/设置可操作/真实衣物图片） |
| `050e372` | v0.3.2：修复风格偏好颜色/409冲突/按钮文案/错误提示 + dev→main合并 |
| — | v0.4.0：接入和风天气API + Vercel部署 |
| — | v0.5.0：集成 DeepSeek AI（意图识别 + 穿搭推荐 + 穿搭理由） |
| `99d7891` | v0.6.0：6个Bug修复 + 标签体系扩充 + 城市远程搜索 |
| `341af72` | v0.6.1：风格偏好保存后无提示且不同步 + 衣橱单品详情页价格不显示 |
| `e6be990` | v0.7.0：穿搭结果页改版 + 首页/个人页精简 + 天气增强 + pg依赖 |
| `87806db` | v0.7.1：接入真实和风天气API（55城市本地ID映射，修复GeoAPI 403 fallback mock问题） |
| — | v0.8.0：iOS App Store 适配（Bundle ID / 隐私声明 / 权限清理 / 设置持久化 / 隐私政策 / EAS Build 配置） |
| `67fa832` | v0.9.0：对齐原型图 — 资源文件+emoji图标+Unsplash图片+场景试穿+模板推荐 |
| `e1213fe` | v0.9.1：灵感详情页+衣橱改版+风格标签重构+关闭 Ark API |
| `03175d6` | v0.9.2：AI 试穿 3 步流程改版（身体信息录入 + 搭配选择 + 场景选择） |
| `1674203` | v0.9.3：修复记录页查询列不存在/收藏 outfit_id 错误；快速添加页与“跳转记录”联动等 |
| `7e94a67` | v0.9.4：设置页对齐原型、个人页精简、衣橱删除无限 loading 修复、GitHub Pages 部署 |
| `1111655` | v0.9.5：统一 AI 过程态（呼吸闪烁 + 进度条）；推荐单品可加入衣橱/心愿单；衣橱按”穿搭+收藏”倒排；单品详情展示穿着记录缩略图；新增独立穿搭详情页 |
| `f022551` | v0.9.6：AI 结果页 banner 精确显示模型来源/耗时/成败（AIMeta.ok 三态）；每日 AI 次数限制改为 10 次/天 |
| `fc72a63` | v0.9.7：AI 试穿接入真实模型（qwen-image-2.0-pro 生图 + deepseek-v4-flash 建议含评分/贴士） |
| `ad52330` | 修复 qwen-image-2.0-pro 端点：compatible-mode 返回空 content，改用 DashScope 原生 MultiModalConversation |
| `60a9283` | 安全：移除 secrets.ts 所有 base64 硬编码 key，统一环境变量注入（.env + GitHub Secrets） |
| `5f52180` | 自拍照持久化：上传至 Supabase Storage + user_body_models 表，启动时从数据库加载；AI 次数限制 10/天 |

## e1213fe 之后的主要更新（v0.9.1+）

> 范围：`e1213fe..HEAD`（共 86 个 commit）。下述为按模块汇总的变更摘要，便于产品/验收；更细粒度可直接查看 GitHub commit 历史。

### 1) 视觉与交互（Editorial Mark v3.6）
- 全局视觉从暖米色系升级为冷调中性黑白体系，统一字体、间距、Tab/空态/卡片等样式，对齐 v3.6 规范。
- Web 端适配增强：iPhone 14 Pro 外壳、@font-face 注入、TabBar 贴底与不截断、Modal/Sheet 约束在手机容器内。

### 2) AI 能力与过程态
- 直接嵌入 DashScope API（qwen3-vl-plus 识别 / qwen-image-2.0-pro 生图）+ DeepSeek API（deepseek-v4-flash 意图识别 / 穿搭推荐 / 试穿建议），不再依赖本地 model-service。
- qwen-image-2.0-pro 使用 DashScope 原生 MultiModalConversation 端点（compatible-mode 返回空 content）。
- AI 结果页显示模型来源 banner：✓ 真实模型·耗时 / ✗ 调用了真实模型但结果不可用·已降级 / ⚠ mock（模型服务不可用）。AIMeta 含 `ok` 字段精确区分三种状态。
- 等待动画统一为 demo 样式：呼吸闪烁加载 + 1%-99% 进度条 + 步骤清单（推荐结果 / 衣物解析 / AI 试穿）。
- 每日使用次数限制：推荐 10 次/天，试穿 10 次/天（客户端 AsyncStorage 计数，按 userId 隔离）。

### 3) AI 试穿
- 试穿流程改为 3 步：身体信息 → 选择搭配（已穿/收藏）→ 选择场景 → 生成。
- 试穿页接入真实 AI：qwen-image-2.0-pro 生成试穿图 + deepseek-v4-flash 生成搭配建议（契合度评分 / 穿搭建议 / 风格小贴士），AI 不可用时降级到本地预置场景图。
- 自拍照持久化：上传至 Supabase Storage（wardrobe-images/selfie/），URL 存入 user_body_models 表，启动时从数据库加载，跨设备跨会话保留（替代之前不可靠的 localStorage 压缩存储）。
- 试穿结果支持保存到记录，并完善试穿历史/详情页展示。

### 4) 衣橱 / 穿搭 / 记录
- 衣橱列表支持按「穿搭次数 + 收藏次数」倒序展示；单品详情展示关联搭配缩略图。
- 新增独立穿搭详情页 `/outfit/[id]`，记录页/单品页点击搭配统一跳转详情页。
- 推荐方案页：推荐单品支持【+衣橱】【+心愿单】真实写入并 toast 提示。
- 修复记录页查询列/收藏关系、月份切换展示逻辑、快速添加流程等问题。

### 5) 工程化、部署与安全
- Web 构建链路完善：`build:web` + post-build patch；GitHub Actions 自动发布到 GitHub Pages（gh-pages 分支）。
- 安全加固：移除 secrets.ts 中所有 base64 硬编码 key，统一改为 EXPO_PUBLIC_* 环境变量注入（本地 .env + CI GitHub Secrets），代码仓库零明文 key。
- CI workflow 注入全部 6 个环境变量（DeepSeek key/host、DashScope key、Supabase URL/anon key/service key）。

## 项目结构

```
src/
  app/
    (auth)/         # 登录、注册
    (tabs)/         # 首页（穿搭灵感+推荐）、衣橱、记录、我的
    onboarding/     # 引导流程 step1-info / step2-style / step3-wardrobe
    outfit/         # 穿搭结果页 / 灵感详情页 / AI试穿 / 身体信息录入
    profile/        # 风格偏好编辑 / 设置页
    wardrobe/       # 添加衣物 / 单品详情 / 单品编辑 / 批量导入
  components/       # ConfirmModal / ProfileEditModal / CategoryIcon / WeatherIcon
  constants/        # theme（配色、字体、间距、圆角、阴影）
  lib/              # supabase / deepseek / dashscope / ai / weather / uploadImage / bodyModel / dailyQuota / mock
  stores/           # userStore / wardrobeStore / wishlistStore / tryonStore
  types/            # TypeScript 类型 + 统一标签定义
assets/
  logo.png          # Stylee Logo
  tryon/            # AI试穿预置场景图（7张）
```

## AI 模型配置

App 直接调用云端 API，无需本地模型服务：

| 能力 | 模型 | 端点 |
|------|------|------|
| 服饰识别（拍照→属性） | qwen3-vl-plus | DashScope compatible-mode chat/completions |
| 标准图/试穿图生成 | qwen-image-2.0-pro | DashScope 原生 MultiModalConversation |
| 意图识别 / 穿搭推荐 / 试穿建议 | deepseek-v4-flash | DeepSeek chat/completions |

API 不可用时自动回落到 mock 数据，不影响基础功能。
