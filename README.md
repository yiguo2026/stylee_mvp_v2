# Stylee — AI 穿搭推荐 MVP

基于 Expo (React Native) + Supabase 的智能穿搭推荐应用，支持 Web / iOS / Android。

**本地体验：** `npx expo start --web` 后访问 http://localhost:8081

## 技术栈

- **前端**：Expo SDK 55 + TypeScript + Expo Router（文件路由）
- **后端**：Supabase（Auth / PostgreSQL / Storage / RLS）
- **天气**：和风天气 API（QWeather 商业版，实时天气数据，15 分钟缓存，55 城市本地 ID 映射 + GeoAPI 远程搜索，自动 fallback 到本地 mock）
- **AI**：DeepSeek API（意图识别、穿搭推荐、穿搭理由，JSON mode）；火山方舟 API 已关闭（节省成本）
- **部署**：Vercel（静态 SPA）+ EAS Build（iOS）
- **状态管理**：Zustand
- **样式**：全局设计规范（三字体体系 / 暖色配色 / emoji 图标系统）

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
- 紧凑分类标签（上装/下装/连体装/外套/鞋/包/帽子/围巾，带数量角标）
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
- 穿搭结果：方案展示、AI点评、收藏、单品替换
- 穿搭历史记录

### AI 试穿
- 身体信息录入（自拍上传，AsyncStorage 持久化，首次录入后无需重复填写）
- 两种入口流程：
  - 首页入口：身体信息 → 选择搭配方案（已穿搭配/收藏搭配 Tab） → 选择场景 → 生成
  - 推荐结果入口：身体信息 → 搭配单品（已选） → 选择场景 → 生成
- 场景风格选择（☕咖啡馆/🏙️街道/💼办公室/🌿公园/🏠居家）
- 生成进度动画（4步：分析身体数据→匹配单品→合成效果→优化细节）
- 效果图展示 + 保存（AI 生成失败时 fallback 到预置场景图）

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
| `EXPO_PUBLIC_DEEPSEEK_KEY` | DeepSeek API Key（可选） | [platform.deepseek.com](https://platform.deepseek.com/) |
| `EXPO_PUBLIC_DEEPSEEK_HOST` | DeepSeek API Host（可选，默认 api.deepseek.com） | — |

> 不配置 `EXPO_PUBLIC_QWEATHER_KEY` 时，天气数据将使用本地 mock 数据；不配置 `EXPO_PUBLIC_DEEPSEEK_KEY` 时，AI 功能将使用本地 mock 数据，均不影响其他功能。

### iOS 构建

```bash
npm run prebuild:ios      # prebuild + 隐私声明补丁
npx expo run:ios          # 本地模拟器运行
# 或使用 EAS 云构建（需先 eas login + eas build --platform ios）
```

### Web 部署

```bash
npm run build:web        # 构建到 dist/
# Vercel 部署：
vercel --yes
```

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
| `e1213fe` | v0.9.1：灵感详情页+衣橱改版+风格标签重构+关闭Ark API |
| — | v0.9.2：AI试穿3步流程改版（身体信息录入+搭配选择+场景选择） |

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
  lib/              # supabase / deepseek / ark / ai / weather / uploadImage / mock
  stores/           # userStore / wardrobeStore / wishlistStore / tryonStore
  types/            # TypeScript 类型 + 统一标签定义
assets/
  logo.png          # Stylee Logo
  tryon/            # AI试穿预置场景图（7张）
```
