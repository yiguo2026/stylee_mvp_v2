# Stylee — AI 穿搭推荐 MVP

基于 Expo (React Native) + Supabase 的智能穿搭推荐应用，支持 Web / iOS / Android。

**在线体验：** https://yiguo2026.github.io/

**本地体验：** `npx expo start --web` 后访问 http://localhost:8081

## 技术栈

- **前端**：Expo SDK 54 + TypeScript + Expo Router（文件路由）
- **后端**：Supabase（Auth / PostgreSQL / Storage / RLS）
- **天气**：和风天气 API（QWeather 商业版，实时天气数据，15 分钟缓存，180+ 城市本地 ID 映射，API 不可用时自动 fallback 到本地 mock）
- **AI**：App 只调用 model service；服务端使用 DashScope（Qwen VL / Qwen Image）与 DeepSeek，密钥不会进入 App 或 Web bundle
- **部署**：GitHub Pages（yiguo2026.github.io 仓库 gh-pages 分支）+ EAS Build（iOS）
- **状态管理**：Zustand
- **样式**：Editorial Mark v3.6（冷调中性黑白体系 / 统一字体体系 / 过程态规范）

## 功能

### 用户系统
- 注册 / 登录（Supabase Auth，邮箱密码）
- 个人资料编辑（头像上传、昵称、性别、年龄、城市搜索、职业下拉选择）
- 更多设置（通知开关、账号安全、隐私、数据管理、关于）

### Onboarding 引导（3步）
- Step1：个人信息（昵称、性别、年龄1-110校验、职业下拉选择、城市搜索选择）
- Step2：风格偏好（19个喜欢标签，点击选择）
- Step3：初始化衣橱（17件AI推荐基础款，Supabase Storage 真实服装图片 + 相册批量导入，可同时选择两类）

### 首页
- 穿搭灵感卡片（竖版图片，点击进入灵感详情页）
- 灵感详情页（大图展示 + X图标关闭 + 风格标签 + 单品拆解：匹配衣橱区分已拥有/推荐，推荐单品可加入衣橱或心愿单，点击查看详情）
- 天气信息 + 快捷穿搭入口

### 衣橱管理
- 紧凑分类标签（上装/下装/连体装/外套/鞋履/包袋/帽巾/配饰，带数量角标）
- 模糊搜索（支持同义词匹配，如"裤子"→下装/阔腿裤/短裤）
- 单品详情查看 + 编辑/删除（header 并排按钮，删除后跳回衣橱 tab，自定义 ConfirmModal，Web 兼容）
- 心愿单（页面底部粉色入口卡片，全屏弹窗展示）
- 快速添加入口（虚线边框卡片）
- 单图多品识别：上传包含多件单品的照片时，AI 检测所有单品，用户多选后逐件确认（标准图+属性）批量导入
- 多图导入：相册选择多张图片，AI 并行识别所有图片中的单品，汇总展示后逐件确认
- 统一添加入口：所有页面（首页/衣橱/穿搭结果）添加衣物均走「相册导入」弹窗 → 拉起图片选择器 → 详情页
- 标准图失败处理：生成失败时提供「重试」和「用原图保存」按钮，不再卡死

### 穿搭推荐
- 实时天气卡片（和风天气 API，180+ 城市本地 ID 映射，自动匹配温度标签）
- 自然语言输入（DeepSeek 意图识别，自动匹配标签）
- 场合/风格/色系/温度标签筛选（场合10个、风格19个、色系8个、温度4个）
- AI 穿搭推荐（DeepSeek 生成搭配方案）
- AI 结果页模型来源 banner（✓ 真实模型·耗时 / ✗ 结果不可用·已降级 / ⚠ mock）
- 穿搭结果：方案展示、收藏、单品替换
- 穿搭历史记录

### AI 试穿
- 身体信息录入（自拍上传至 Supabase Storage，持久化到 user_body_models 表，跨设备跨会话保留）
- 两种入口流程：
  - 首页入口：身体信息 → 选择搭配方案（已穿搭配/收藏搭配 Tab） → 选择场景 → 生成
  - 推荐结果入口：身体信息 → 搭配单品（已选） → 选择场景 → 生成
- 场景风格选择（☕咖啡馆/🏙️街道/💼办公室/🌿公园/🏠居家）
- 等待过程态（1%-99% 进度条 + 4 步清单 + 呼吸闪烁动画：分析身体数据→匹配单品→合成效果→优化细节）
- AI 试穿图生成（qwen-image-2.0-pro）
- 效果图展示 + 保存（AI 生成失败时 fallback 到预置场景图）
- 试穿记录持久化到 Supabase tryon_records 表，详情页展示 AI 效果图
- 每日使用次数限制（10次/天，客户端 AsyncStorage 计数）

### Web 兼容
- ConfirmModal 替代 Alert.alert 多按钮弹窗
- Web 端不喜欢按钮替代 onLongPress
- PlayfairDisplay 字体跨平台统一
- useWindowDimensions 响应式布局
- 图片上传 blob URL 扩展名处理

## 数据库

12 张表 + 2 个 Storage bucket，全部启用 RLS：

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
| `tryon_records` | AI 试穿记录（场景/搭配/效果图URL/AI建议） |
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
| `EXPO_PUBLIC_STYLEE_API` | model service 地址；生产必须为 HTTPS | 服务端部署地址 |

> DeepSeek、DashScope key 只能配置在 model service 的服务端环境变量中。Supabase secret/service-role key 不属于 model service，也禁止进入 App/Web；用户注册继续使用主仓的 Supabase Auth。model service 不可用时，App 的 AI 功能回落到 mock/预置结果。

### 用户注册安全配置

用户管理由主仓 Supabase Auth 承担，不经过 model service。现有 Supabase 项目需在 SQL Editor 执行一次 `supabase-auth-registration.sql`，并在 Authentication → Providers → Email 中关闭 `Confirm email`（项目使用 `username@users.stylee.app` 虚拟邮箱）。该方案通过数据库 trigger 创建 `users` 资料行，不需要任何客户端或 model service 的 service-role key。

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
- 部署目标：`yiguo2026/yiguo2026.github.io` 仓库的 `gh-pages` 分支。
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
| `2a19374` | 扩展添加衣物表单10字段；修复标准图原图未发送bug；优化推荐prompt(硬约束+温度映射+few-shot+tag翻译)；图片显示contain模式 |
| `923ff01` | 试穿记录持久化到 Supabase（新建 tryon_records 表；addRecord 改 async + Supabase 读写；详情页展示 AI 效果图 + 契合度评分/建议/贴士） |
| `b65c9c5` | 修复试穿记录图片为 mock：用 AI 返回的 imageResult.url 而非 stale state |
| — | v0.10.0：统一添加衣物入口 + 多图导入 + 标准图失败重试；移除心愿单 mock 预填数据；修复快速添加后衣橱/穿搭页不刷新（useFocusEffect）；数据库 category 约束扩展至8类；新增 normalizeCategory 归一化函数；部署流程从 Vercel 切换到 GitHub Pages；添加 /deploy skill 和 guard hook |
| `fe42bbc` | 快速添加推荐单品精简为17件（仅保留有真实图片的单品），图片从 Unsplash 迁移至 Supabase Storage |
| `9cdf4a4` | 移除 AI 试穿评分/点评和穿搭详情 AI 点评（PRD 无此功能） |
| `a7be5b5` | 修复 GitHub Pages 天气始终为 mock：deploy workflow 补充 EXPO_PUBLIC_QWEATHER_KEY/HOST 环境变量 |
| — | v0.10.1：修复个人页穿搭/收藏数量不同步（新增 outfitStore Zustand 全局状态，保存后实时更新）；修复 useFocusEffect 在 Web 端不可用（从 react-native 改为 @react-navigation/native 导入）；单品详情页基础属性默认展开，移除折叠按钮 |
| `5600173` | 稳定性：添加 ErrorBoundary 防白屏 + 404.html 支持 SPA 深链接路由 |
| `de21d25` | 修复 onboarding step3 AI 推荐单品无缩略图：用 Supabase Storage 真实图片替代 CategoryIcon |
| `bfe7c6c` | AI 识别输出精简：单品名称简洁客观，颜色/材质优先匹配标准列表，新增 normalizeColor/normalizeMaterial 归一化函数 |
| `19cd49b` | 标准图默认模型从 qwen-image-2.0 改为 qwen-image-edit（图生图场景应用 edit 模型） |
| — | 修复删除单品：详情页 header 添加「删除」按钮与「编辑」并排；删除后跳回衣橱 tab（router.replace）而非停留在详情页 |
| `7788fd5` | 修复快速添加推荐单品页勾选对勾被裁切：移除 overflow:hidden，对勾悬浮于缩略图之上 |
| — | 修复登录/注册页：用户名限制英文+数字+下划线（中文会触发邮箱格式错误）；重复用户名红字提示移至输入框下方；placeholder 提示支持的格式 |
| `5dd80c5` | 修复 AI 次数计数异常：防止 consumeQuota 重复调用（ref 守卫）；首页 useFocusEffect 刷新配额；AI 试穿过渡动画显示剩余次数 |
| — | 表单校验增强：年龄允许输入但实时校验格式（非数字/1-110范围红字提示）；职业改为下拉选择（16个预设选项）；城市搜索内置180+地级市数据（修复API 403导致搜索无结果）；ProfileEditModal 打开时同步最新profile数据；城市弹窗独立层级覆盖全屏 |
| — | 修复 onboard step3 选中单品✅被裁切：builtinIcon 移除 overflow:hidden，改为 position:relative，对齐快速添加页 |
| — | 修复灵感详情页单品拆解"已拥有"标记不准确：同类别有衣橱单品即标记已拥有；已拥有单品缩略图和名称优先使用衣橱真实数据 |
| — | Onboarding 3步均增加"←返回上一步"按钮；"跳过"居中；step2移除多余图例和提示文案 |
| — | 修复心愿单"加入衣橱"不生效：source_type改为manual避免DB CHECK约束冲突；category做normalize；错误时回滚心愿单UI；成功后刷新衣橱数据 |

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
  components/       # ConfirmModal / ProfileEditModal / CategoryIcon / WeatherIcon / AddClothingSheet
  constants/        # theme（配色、字体、间距、圆角、阴影）
  lib/              # supabase / deepseek / dashscope / ai / weather / chinaCities / uploadImage / bodyModel / dailyQuota / mock
  stores/           # userStore / wardrobeStore / wishlistStore / tryonStore
  types/            # TypeScript 类型 + 统一标签定义
assets/
  logo.png          # Stylee Logo
  tryon/            # AI试穿预置场景图（7张）
```

## AI 模型配置

App 不直连任何模型 API，全部能力通过 model service：

| 能力 | 模型 | 端点 |
|------|------|------|
| 服饰识别（单品/多品） | qwen3-vl-plus | model service `/recognize` / `/recognize-multi` |
| 标准图/试穿图生成 | qwen-image-edit | model service `/standardize` / `/tryon-image` |
| 意图识别 / 搭配推荐 / 试穿建议 | DeepSeek | model service 专用端点 |

生产部署时 model service 会校验 Supabase 用户 JWT、限制来源域名与每分钟请求数。模型 API 不可用时自动回落到 mock 数据，不影响基础功能。

### Gamma 直接模型实验

设置页提供独立的 `Gamma 直接模型版` 入口，不替换现有导入或 B0–B6/RAG
推荐流程。Gamma 仍只通过受鉴权的 model service 调用供应商：

- 导入：`POST /gamma/import`，一次 Qwen VL 识别后直接执行一次 Qwen 图片编辑。
- 搭配：`POST /gamma/outfit`，一次 DeepSeek JSON 生成完整搭配；仅衣橱缺失的新推荐单品并行调用 Qwen 文生图。
- 调整：`action=replace_item|replace_all` 携带上一套结果和用户的新要求，实现换单件或换整套。
- 试穿：从 Gamma 搭配结果进入 `POST /gamma/tryon`，身体照、搭配与场景只经过 Model Service，一次调用 Qwen 多图编辑生成试穿图。
- 持久化：导入标准图和加入衣橱的新推荐单品会复制到 Stylee Storage；Gamma 试穿当前直接展示并记录供应商临时 URL，后续需迁移到私有图片存储以长期保留。

Gamma 与现有端点和页面完全并行，便于对比端到端耗时、质量和模型成本；完整边界与失败策略见 `model-service/ARCHITECTURE.md`。
