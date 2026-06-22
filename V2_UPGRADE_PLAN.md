# Stylee MVP v2 升级开发计划与进度

> 仓库: https://github.com/yiguo2026/stylee_mvp_v2
> Demo: https://d995b454967f.aime-app.bytedance.net/
> 开始日期: 2026-06-21

## 进度追踪

| # | 模块 | 状态 | 预估 | 完成时间 | Git Commit |
|---|------|------|------|----------|------------|
| 1 | 类型定义 | ✅ 完成 | 2h | 06-21 | d4e7a4a |
| 2 | 数据库 Schema | ✅ 完成 | 4h | 06-21 | 86b8668 |
| 3 | 注册登录 | ✅ 完成 | 4h | 06-21 | f7f4aef |
| 4 | 新用户初始化 | ✅ 完成 | 6h | 06-21 | e989587 |
| 5 | 页面框架 | ✅ 完成 | 0.5h | 06-21 | a3ceb28 |
| 6 | 穿搭页 | ✅ 完成 | 16h | 06-21 | 41a1b0e |
| 7 | 衣橱页 | ✅ 完成 | 14h | 06-21 | edee6ef |
| 8 | 记录页 | ✅ 完成 | 8h | 06-21 | 652ca0b |
| 9 | 我的页 | ✅ 完成 | 6h | 06-21 | 92e796f |

---

## 模块1: 类型定义 ✅

- ClothingCategory: 上装/下装/连体装/外套/鞋/包/帽子/围巾
- 新增 MaterialType(25种), SleeveLength, FitType, BodyShape 枚举
- SourceType 新增 'ai_recommended'
- 新增 WishlistItem, InspirationCard, OutfitFavorite, BodyModel 类型
- 标签体系: 场合6个/风格14个/色系8个
- PRESET_BASIC_ITEMS(28件基础款), CLOTHING_CATEGORIES_WITH_ALL

---

## 模块2: 数据库 Schema ✅

- users 新增 username UNIQUE 字段
- wardrobe_items 新增: images(JSONB), source_label, sleeve_length, season(JSONB), occasion_tags(JSONB), purchase_date
- 新增表: outfit_favorites, wishlist_items, inspiration_cards, user_body_models, wear_events
- tags 数据更新为 v2 体系
- 新增 body-photos Storage bucket

---

## 模块3: 注册登录 ✅

- 用户名+密码认证 (用 username@stylee.local 虚拟email方案)
- 字段级错误提示(用户名格式/重复、密码不一致)
- 注册成功跳转登录页(不自动登录)
- 用户协议弹窗
- 登录按钮在用户名+密码均填写后才激活

---

## 模块4: 新用户初始化 ✅

- Step1: 随机昵称生成(形容词+名词+数字)+"换一个"按钮，性别改为👩女士/👨男士/✨其他
- Step2: 看图选风格(14种风格带emoji大卡片+不喜欢标签)，预览区显示选择结果
- Step3: 使用PRESET_BASIC_ITEMS(28件)，分类Tab更新(含连体装/帽子/围巾)

---

## 模块5: 页面框架 ✅

- Tab 顺序: 穿搭→衣橱→记录→我的

---

## 模块6: 穿搭页 ✅

### 改动内容
- 顶部天气条（品牌字标+天气按钮）
- 双路径输入（描述/标签筛选 tab切换）
- 我的衣橱横滑预览区
- 穿搭灵感横滑卡片
- AI试穿入口（P2）
- 搭配结果页重写（1套默认+收藏+心愿单）

### 进度
- [x] 穿搭首页 (tabs)/index.tsx
- [x] 搭配结果页 outfit/result.tsx
- [x] AI Prompt 调整（意图识别+推荐Prompt同步v2标签体系）
- [x] Mock数据更新（recommendation/recognition同步新分类）

---

## 模块7: 衣橱页 ✅

- 心愿单功能（P1）— wishlistStore + 横滑卡片 + 转入衣橱/移除
- 分类更新（8类+件数角标）— CLOTHING_CATEGORIES_WITH_ALL + emoji + count badge
- 单品详情页重构（多图+扩展标签+来源+已穿搭配）— 基础属性编辑展开 + 穿着记录 + 已穿搭配区
- 悬浮添加按钮 — FAB + 弹窗(单品录入/批量导入/链接导入)
- 链接导入功能 — LinkImportModal

---

## 模块8: 记录页 ✅

- 双Tab（已穿搭配/收藏搭配）
- 日历+列表混合视图
- 试穿记录关联（P2，暂保留接口）

---

## 模块9: 我的页 ✅

- 收藏搭配数 — outfit_favorites表count
- 设置页细化 — 用户名+密码+反馈入口+隐私政策
- P2试穿记录入口 — 空状态展示
- 编辑资料 — 体型选择(AI试穿)+性别更新
