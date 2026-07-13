# App ↔ 本地推理服务接入 Implementation Plan（子项目 2）

> **已废弃（安全原因）**：此历史计划包含客户端模型直连回落，不得继续执行。当前所有模型调用只能经过受认证、限流的 model service。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 App 的服饰识别 / 单品标准化 / Garments2Look 推荐三个能力先打本地推理服务、失败回落今天的行为。

**Architecture:** 新增瘦客户端 `styleeService.ts`（I/O）+ 纯映射模块 `styleeMapping.ts`（可单测）；`ai.ts` 三函数"先服务后回落"；`add.tsx` 加自动标准化环节。服务不可达 = 回到现有行为 + 一次轻提示。

**Tech Stack:** Expo v55 / React Native / TypeScript 5.8 / 原生 `fetch`+`AbortController`。测试用 Node 22 内置 `node --test`（`.ts` 直跑，类型擦除），类型门 `npx --no-install tsc --noEmit`。

## Global Constraints

- 分支 `feat/model-service-integration`，base 快照 `25fe756`。**不 push**。
- **不改 `src/app/outfit/result.tsx`**；`aiRecommendOutfits(items, userId, sessionId, context)` 签名不变。
- **不改 `ai.ts` 的 `INTENT_SYSTEM_PROMPT`**（同伴 WIP 区域，避免纠缠）。
- **零新依赖**：不装 jest/tsx，不改 `package.json` 的 dependencies/devDependencies。测试用 `node --test`。
- **类型门**：改动后 `npx --no-install tsc --noEmit` 必须仍是 **0 error**（baseline 已验证为 0）。
- 服务地址：`process.env.EXPO_PUBLIC_STYLEE_API ?? 'http://127.0.0.1:8000'`。
- **push 前欠债（本轮不做）**：对齐 origin/main 的 secrets.ts / 视觉重构 / 枚举。
- Expo 动 UI 前读 https://docs.expo.dev/versions/v55.0.0/ 。

## 本地服务契约（照抄，勿改服务）

- `GET /health` → `{"status":"ok"}`
- `POST /recognize` `{image_b64,mime}` → `{category,color,material,style,brand,photo_type,needs_review,confidence}`
- `POST /standardize` `{image_b64,mime,photo_type,item:{category}}` → `{image_ref,method,verified}`（image_ref 是临时 OSS URL）
- `POST /recommend` `{input_mode:"nl",query,n,profile,weather,wardrobe[]}` → `{outfits:[{name,owned_item_ids,recommended_items,comment}],trace}`（已 App 形状）

## File Structure

- Create `src/lib/styleeMapping.ts` — 纯映射 + 契约类型（无 I/O，`import type` 引 App 类型）。
- Create `src/lib/styleeMapping.test.ts` — `node --test` 单测。
- Create `src/lib/styleeService.ts` — I/O 客户端（fetch/超时/回落 null/轻提示）。
- Create `src/lib/styleeService.test.ts` — mock `globalThis.fetch` 的单测。
- Modify `src/lib/ai.ts` — 三函数接线 + 新 `aiStandardizeGarment`。
- Modify `src/types/index.ts` — 扩 `RecognitionResult` 可选字段（~179 行区域，避开同伴改的 ~250 行）。
- Modify `src/app/wardrobe/add.tsx` — 标准化 UX。
- Create `.env.example`；Modify `README.md`（若无则 Create）。
- Create `scripts/styleeSmoke.ts` — 对真服务的集成 smoke。

---

### Task 1: 纯映射模块 styleeMapping.ts + 单测

**Files:**
- Create: `src/lib/styleeMapping.ts`
- Test: `src/lib/styleeMapping.test.ts`

**Interfaces:**
- Consumes: `WardrobeItem`, `Outfit`, `OutfitItem`, `RecommendedItem`, `RecognitionResult`, `ClothingCategory` from `@/types`（仅 `import type`）。
- Produces（后续任务依赖，签名固定）:
  - 类型 `RecognizeResp`, `StandardizeResp`, `RecommendReqItem`, `RecommendReq`, `RecommendRespOutfit`, `RecommendResp`
  - `recognizeRespToResult(resp: RecognizeResp): RecognitionResult`
  - `toRecommendRequest(items: WardrobeItem[], context?: RecommendContext): RecommendReq`
  - `outfitsRespToApp(outfits: RecommendRespOutfit[], items: WardrobeItem[], userId: string, sessionId: string): Outfit[]`
  - `type RecommendContext = { weather?: string; temp?: string; city?: string; query?: string; tags?: string; stylePreferences?: string }`

- [ ] **Step 1: 写失败测试** `src/lib/styleeMapping.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import type { WardrobeItem } from '@/types';
import { recognizeRespToResult, toRecommendRequest, outfitsRespToApp } from './styleeMapping.ts';

const item = (o: Partial<WardrobeItem>): WardrobeItem => ({
  item_id: 'x', user_id: 'u', name: '', category: '上装', color: '白',
  source_type: 'manual', status: 'active', created_at: '', updated_at: '', ...o,
} as WardrobeItem);

test('recognizeRespToResult 映射并带出 photo_type/needs_review', () => {
  const r = recognizeRespToResult({
    category: '上装', color: '白色', material: '棉', style: '简约', brand: '',
    photo_type: 'on_body', needs_review: false, confidence: 0.95,
  });
  assert.equal(r.category, '上装');
  assert.equal(r.color, '白色');
  assert.equal(r.photo_type, 'on_body');
  assert.equal(r.needs_review, false);
});

test('toRecommendRequest 映射 fit_type→fit、拆 style_prefs、temp→temp_c', () => {
  const req = toRecommendRequest(
    [item({ item_id: 't1', category: '上装', fit_type: '修身', color: '白', material: '棉', season: ['春'], occasion_tags: ['通勤'] })],
    { query: '约会', temp: '22', city: '上海', weather: '晴', stylePreferences: '法式、通勤' },
  );
  assert.equal(req.input_mode, 'nl');
  assert.equal(req.query, '约会');
  assert.equal(req.n, 3);
  assert.equal(req.wardrobe[0].fit, '修身');
  assert.equal(req.wardrobe[0].item_id, 't1');
  assert.equal(req.weather.temp_c, 22);
  assert.equal(req.weather.city, '上海');
  assert.deepEqual(req.profile.style_prefs, ['法式', '通勤']);
});

test('toRecommendRequest 只取 active、query 空时退回 tags', () => {
  const req = toRecommendRequest(
    [item({ item_id: 'a', status: 'active' }), item({ item_id: 'b', status: 'archived' as any })],
    { tags: '通勤,黑色' },
  );
  assert.equal(req.wardrobe.length, 1);
  assert.equal(req.wardrobe[0].item_id, 'a');
  assert.equal(req.query, '通勤,黑色');
});

test('outfitsRespToApp 用 itemMap 还原已有单品、映射补充件与理由', () => {
  const items = [item({ item_id: 't1', category: '上装' }), item({ item_id: 'b1', category: '下装' })];
  const outfits = outfitsRespToApp(
    [{ name: '约会', owned_item_ids: ['t1', 'b1', 'nope'],
       recommended_items: [{ name: '丝巾', category: '围巾', color: '米色', description: '点睛' }],
       comment: '顺色显高' }],
    items, 'u1', 's1',
  );
  assert.equal(outfits.length, 1);
  assert.equal(outfits[0].name, '约会');
  assert.equal(outfits[0].ai_comment, '顺色显高');
  assert.equal(outfits[0].user_id, 'u1');
  assert.equal(outfits[0].session_id, 's1');
  assert.equal(outfits[0].source, 'ai_generated');
  assert.equal(outfits[0].items?.length, 2); // 'nope' 被丢弃
  assert.equal(outfits[0].recommended_items?.[0].name, '丝巾');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/styleeMapping.test.ts`
Expected: FAIL（`Cannot find module './styleeMapping.ts'`）

- [ ] **Step 3: 实现 `src/lib/styleeMapping.ts`**

```ts
import type { WardrobeItem, Outfit, OutfitItem, RecommendedItem, RecognitionResult, ClothingCategory } from '@/types';

export interface RecognizeResp {
  category: string; color: string; material: string; style: string;
  brand: string; photo_type: string; needs_review: boolean; confidence: number;
}
export interface StandardizeResp { image_ref: string; method: string; verified: boolean; }
export interface RecommendReqItem {
  item_id: string; name: string; category: string; color: string;
  material?: string; sleeve_length?: string; fit?: string; season?: string[]; occasion_tags?: string[];
}
export interface RecommendReq {
  input_mode: 'nl'; query: string; n: number;
  profile: { gender?: string; body_shape?: string; skin_tone?: string; style_prefs?: string[] };
  weather: { temp_c?: number; condition?: string; city?: string; time_of_day?: string };
  wardrobe: RecommendReqItem[];
}
export interface RecommendRespOutfit {
  name: string; owned_item_ids: string[];
  recommended_items: { name: string; category: string; color: string; description?: string }[];
  comment: string;
}
export interface RecommendResp { outfits: RecommendRespOutfit[]; trace?: { rag_mode?: string; pool?: number }; }

export type RecommendContext = {
  weather?: string; temp?: string; city?: string; query?: string; tags?: string; stylePreferences?: string;
};

export function recognizeRespToResult(resp: RecognizeResp): RecognitionResult {
  return {
    category: (resp.category || '上装') as ClothingCategory,
    color: resp.color || '未知',
    material: resp.material || '',
    style: resp.style || '',
    brand: resp.brand || '',
    photo_type: resp.photo_type || undefined,
    needs_review: resp.needs_review ?? undefined,
    confidence: typeof resp.confidence === 'number' ? resp.confidence : undefined,
  };
}

export function toRecommendRequest(items: WardrobeItem[], context?: RecommendContext): RecommendReq {
  const active = items.filter(i => i.status === 'active');
  const prefs = (context?.stylePreferences || '').split(/[、,，]/).map(s => s.trim()).filter(Boolean);
  const temp = context?.temp ? parseInt(context.temp, 10) : undefined;
  return {
    input_mode: 'nl',
    query: context?.query || context?.tags || '',
    n: 3,
    profile: { style_prefs: prefs.length ? prefs : undefined },
    weather: {
      temp_c: Number.isFinite(temp as number) ? temp : undefined,
      condition: context?.weather || undefined,
      city: context?.city || undefined,
    },
    wardrobe: active.map(i => ({
      item_id: i.item_id, name: i.name, category: i.category, color: i.color,
      material: i.material || undefined,
      sleeve_length: i.sleeve_length || undefined,
      fit: i.fit_type || undefined,
      season: i.season && i.season.length ? i.season : undefined,
      occasion_tags: i.occasion_tags && i.occasion_tags.length ? i.occasion_tags : undefined,
    })),
  };
}

export function outfitsRespToApp(
  outfits: RecommendRespOutfit[], items: WardrobeItem[], userId: string, sessionId: string,
): Outfit[] {
  const itemMap = new Map(items.map(i => [i.item_id, i]));
  const result: Outfit[] = [];
  for (const o of outfits || []) {
    const outfit_id = `ai_outfit_${result.length}_${Date.now()}`;
    const outfitItems: OutfitItem[] = [];
    let order = 0;
    for (const id of Array.isArray(o.owned_item_ids) ? o.owned_item_ids : []) {
      const it = itemMap.get(id);
      if (!it) continue;
      outfitItems.push({ item_id: id, outfit_id, display_order: order++, item: it });
    }
    const recommended: RecommendedItem[] = Array.isArray(o.recommended_items)
      ? o.recommended_items.map(r => ({
          name: String(r.name || ''),
          category: String(r.category || '配饰') as ClothingCategory,
          color: String(r.color || ''),
          description: r.description ? String(r.description) : undefined,
        }))
      : [];
    if (outfitItems.length === 0 && recommended.length === 0) continue;
    result.push({
      outfit_id, user_id: userId, session_id: sessionId,
      name: o.name || `方案 ${result.length + 1}`,
      ai_comment: o.comment || '',
      source: 'ai_generated',
      items: outfitItems,
      recommended_items: recommended.length ? recommended : undefined,
      created_at: new Date().toISOString(),
    });
  }
  return result;
}
```

- [ ] **Step 4: 扩 `RecognitionResult`（`src/types/index.ts`，~179 行区域）**

在 `RecognitionResult` 接口尾部加三个可选字段（不动同伴改的 `STYLE_TAGS`/`TAG_DISPLAY`）：

```ts
export interface RecognitionResult {
  category: ClothingCategory;
  color: string;
  material?: string;
  style?: string;
  brand?: string;
  sleeve_length?: SleeveLength;
  fit_type?: FitType;
  photo_type?: string;      // 服务返回：on_body|flat|product
  needs_review?: boolean;   // 服务返回：低置信需人工确认
  confidence?: number;      // 服务返回：0-1
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --test src/lib/styleeMapping.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 6: 类型门**

Run: `npx --no-install tsc --noEmit`
Expected: 0 error

- [ ] **Step 7: Commit**

```bash
git add src/lib/styleeMapping.ts src/lib/styleeMapping.test.ts src/types/index.ts
git commit -m "feat(app): pure stylee mapping module + RecognitionResult service fields"
```

---

### Task 2: styleeService I/O 客户端 + fetch-mock 单测

**Files:**
- Create: `src/lib/styleeService.ts`
- Test: `src/lib/styleeService.test.ts`

**Interfaces:**
- Consumes: `RecognizeResp, StandardizeResp, RecommendReq, RecommendResp`（Task 1）。
- Produces:
  - `STYLEE_API: string`
  - `uriToBase64(uri: string): Promise<{ b64: string; mime: string } | null>`
  - `serviceHealth(): Promise<boolean>`
  - `serviceRecognize(b64: string, mime: string): Promise<RecognizeResp | null>`
  - `serviceStandardize(b64: string, mime: string, photoType: string, category: string): Promise<StandardizeResp | null>`
  - `serviceRecommend(req: RecommendReq): Promise<RecommendResp | null>`
  - `subscribeServiceUnavailable(cb: () => void): void`（首次不可达触发一次，一会话一次）

- [ ] **Step 1: 写失败测试** `src/lib/styleeService.test.ts`

```ts
import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { serviceRecognize, serviceRecommend, serviceHealth } from './styleeService.ts';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('serviceRecognize 打 /recognize 并解析 json', async () => {
  let seen: any = null;
  globalThis.fetch = (async (url: any, init: any) => {
    seen = { url: String(url), init };
    return { ok: true, json: async () => ({ category: '上装', color: '白色' }) } as any;
  }) as any;
  const r = await serviceRecognize('QUJD', 'image/png');
  assert.match(seen.url, /\/recognize$/);
  assert.equal(seen.init.method, 'POST');
  assert.equal(JSON.parse(seen.init.body).image_b64, 'QUJD');
  assert.equal(r?.category, '上装');
});

test('serviceRecommend 非 2xx 返回 null', async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 500, text: async () => 'err' }) as any) as any;
  const r = await serviceRecommend({ input_mode: 'nl', query: 'x', n: 3, profile: {}, weather: {}, wardrobe: [] });
  assert.equal(r, null);
});

test('serviceHealth 抛异常返回 false（不冒泡）', async () => {
  globalThis.fetch = (async () => { throw new Error('conn refused'); }) as any;
  assert.equal(await serviceHealth(), false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test src/lib/styleeService.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/lib/styleeService.ts`**

```ts
import type { RecognizeResp, StandardizeResp, RecommendReq, RecommendResp } from './styleeMapping.ts';

export const STYLEE_API = process.env.EXPO_PUBLIC_STYLEE_API ?? 'http://127.0.0.1:8000';

let _notified = false;
const _subs: Array<() => void> = [];
export function subscribeServiceUnavailable(cb: () => void): void { _subs.push(cb); }
function _fireUnavailable(): void {
  if (_notified) return;
  _notified = true;
  console.warn('[stylee] 未连接本地模型服务，已用备用方案');
  for (const cb of _subs) { try { cb(); } catch {} }
}

async function _postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${STYLEE_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) { console.warn(`[stylee] ${path} ${res.status}`); _fireUnavailable(); return null; }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[stylee] ${path} failed:`, e);
    _fireUnavailable();
    return null;
  } finally { clearTimeout(timer); }
}

export async function serviceHealth(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${STYLEE_API}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch { return false; } finally { clearTimeout(timer); }
}

export async function serviceRecognize(b64: string, mime: string): Promise<RecognizeResp | null> {
  return _postJson<RecognizeResp>('/recognize', { image_b64: b64, mime }, 20000);
}

export async function serviceStandardize(
  b64: string, mime: string, photoType: string, category: string,
): Promise<StandardizeResp | null> {
  return _postJson<StandardizeResp>('/standardize',
    { image_b64: b64, mime, photo_type: photoType, item: { category } }, 40000);
}

export async function serviceRecommend(req: RecommendReq): Promise<RecommendResp | null> {
  return _postJson<RecommendResp>('/recommend', req, 40000);
}

// RN/web 专用：本地 uri → base64（Node 无 FileReader，故不在 node --test 覆盖，靠集成 smoke/手动验证）
export async function uriToBase64(uri: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const b64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || result);
      };
      reader.readAsDataURL(blob);
    });
    return { b64, mime: blob.type || 'image/jpeg' };
  } catch (e) {
    console.warn('[stylee] uriToBase64 failed:', e);
    return null;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test src/lib/styleeService.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: 类型门**

Run: `npx --no-install tsc --noEmit`
Expected: 0 error

- [ ] **Step 6: Commit**

```bash
git add src/lib/styleeService.ts src/lib/styleeService.test.ts
git commit -m "feat(app): styleeService HTTP client with timeout + graceful null fallback"
```

---

### Task 3: ai.ts 接线（识别 / 标准化 / 推荐）

**Files:**
- Modify: `src/lib/ai.ts`

**Interfaces:**
- Consumes: Task 1（`recognizeRespToResult, toRecommendRequest, outfitsRespToApp`）、Task 2（`uriToBase64, serviceRecognize, serviceStandardize, serviceRecommend`）。
- Produces（供 add.tsx）: `aiStandardizeGarment(imageUri: string, category: string, photoType: string): Promise<string | null>`；`aiRecognizeClothing`/`aiRecommendOutfits` 行为增强、签名不变。

- [ ] **Step 1: 加 import**（`ai.ts` 顶部，不动 `INTENT_SYSTEM_PROMPT`）

```ts
import { uriToBase64, serviceRecognize, serviceStandardize, serviceRecommend } from '@/lib/styleeService';
import { recognizeRespToResult, toRecommendRequest, outfitsRespToApp } from '@/lib/styleeMapping';
```

- [ ] **Step 2: `aiRecognizeClothing` 加"服务优先"分支**

在函数体最前面（`isArkAvailable()` 之前）插入：

```ts
  const enc = await uriToBase64(imageUri);
  if (enc) {
    const resp = await serviceRecognize(enc.b64, enc.mime);
    if (resp) return recognizeRespToResult(resp);
  }
```
（注意参数名：现有签名是 `aiRecognizeClothing = async (imageUri: string)`。保留其后 Ark→mock 原逻辑不变。）

- [ ] **Step 3: 新增 `aiStandardizeGarment`**（放在 `aiRecognizeClothing` 之后）

```ts
export const aiStandardizeGarment = async (
  imageUri: string, category: string, photoType: string,
): Promise<string | null> => {
  const enc = await uriToBase64(imageUri);
  if (!enc) return null;
  const resp = await serviceStandardize(enc.b64, enc.mime, photoType || 'flat', category);
  return resp?.image_ref ?? null;
};
```

- [ ] **Step 4: `aiRecommendOutfits` 加"服务优先"分支**

在函数体内、构造 `itemsSummary` 校验之后、调用 `deepseekChat` 之前插入服务优先分支（命中即返回，未命中继续走现有 DeepSeek 逻辑）：

```ts
  const svcResp = await serviceRecommend(toRecommendRequest(wardrobeItems, context));
  if (svcResp && Array.isArray(svcResp.outfits) && svcResp.outfits.length > 0) {
    const mapped = outfitsRespToApp(svcResp.outfits, wardrobeItems, userId, sessionId);
    if (mapped.length > 0) return { outfits: mapped };
  }
```
（保留其后现有 DeepSeek→mock 逻辑完全不变，作为回落。）

- [ ] **Step 5: 类型门**

Run: `npx --no-install tsc --noEmit`
Expected: 0 error

- [ ] **Step 6: 回归 —— 两个纯映射单测仍绿**

Run: `node --test src/lib/styleeMapping.test.ts src/lib/styleeService.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai.ts
git commit -m "feat(app): wire recognition/standardization/recommendation to local service with fallback"
```

---

### Task 4: add.tsx 自动标准化 UX

**Files:**
- Modify: `src/app/wardrobe/add.tsx`

**Interfaces:**
- Consumes: Task 3 `aiStandardizeGarment`；`aiRecognizeClothing` 现返回带 `photo_type` 的结果；Task 2 `subscribeServiceUnavailable`。
- 约束：在同伴 WIP 版 add.tsx（`activeUser`/`loadMockSession`/`router.replace('/wardrobe')`）基础上叠加，保留其登录逻辑。

- [ ] **Step 1: 读 Expo v55 相关 API**

Run: 参考 https://docs.expo.dev/versions/v55.0.0/ （无需改依赖，仅确认 RN 组件用法）

- [ ] **Step 2: 加状态与 import**

- import 追加：`import { aiRecognizeClothing, aiStandardizeGarment, CATEGORY_OPTIONS, COLOR_OPTIONS, MATERIAL_OPTIONS } from '@/lib/ai';`（在现有 import 上加 `aiStandardizeGarment`）
- 组件内新增 state：

```ts
  const [photoType, setPhotoType] = useState<string>('flat');
  const [standardizedUri, setStandardizedUri] = useState<string | null>(null);
  const [stdState, setStdState] = useState<'idle' | 'generating' | 'done' | 'failed'>('idle');
  const [useStandardized, setUseStandardized] = useState(true);
```

- [ ] **Step 3: 识别完自动触发标准化**

改 `runRecognition`：识别拿到结果后存 `photo_type` 并自动调标准化（非阻塞，不锁表单）：

```ts
  const runRecognition = async (uri: string) => {
    setRecognizing(true);
    setStandardizedUri(null); setStdState('idle');
    try {
      const result = await aiRecognizeClothing(uri);
      setCategory(result.category);
      setColor(result.color);
      if (result.material) setMaterial(result.material);
      if (!name) setName(`${result.color}${result.category}`);
      const pt = result.photo_type || 'flat';
      setPhotoType(pt);
      void runStandardize(uri, result.category, pt);
    } finally {
      setRecognizing(false);
    }
  };

  const runStandardize = async (uri: string, cat: string, pt: string) => {
    setStdState('generating');
    const std = await aiStandardizeGarment(uri, cat, pt);
    if (std) { setStandardizedUri(std); setUseStandardized(true); setStdState('done'); }
    else { setStdState('failed'); }
  };
```

- [ ] **Step 4: 预览区展示 生成中 / 完成切换 / 失败**

在图片区（`imageContainer`）内，`recognizing` 遮罩逻辑旁增加：
- `stdState==='generating'` → 叠一层非阻塞角标（右下角 spinner + "标准化中…"）。
- `stdState==='done'` → 预览 `source={{ uri: useStandardized && standardizedUri ? standardizedUri : imageUri }}`；下方出现分段切换 `原图 | 标准图`（点按 `setUseStandardized`）+ 小字"✓ 已生成标准图"。
- `stdState==='failed'` → 小字"标准图生成失败，用原图"。

（用现有 `styles` 体系新增少量样式；分段切换用两个 `TouchableOpacity`，选中态套用 `Colors.terracotta`/`vintageCream`。预览 `Image` 的 `source.uri` 改为上面的三元表达式。）

- [ ] **Step 5: 保存用选中图**

改 `handleSave` 里的上传源：

```ts
    let finalImageUrl = imageUri;
    const chosen = (useStandardized && standardizedUri) ? standardizedUri : imageUri;
    if (chosen) {
      const uploaded = await uploadWardrobeImage(chosen, activeUser.id);
      if (uploaded) finalImageUrl = uploaded;
      else finalImageUrl = imageUri; // 转存失败回退原图
    }
```
（保留同伴的 `activeUser`/mock 逻辑、`router.replace('/wardrobe')` 不变。`source_type` 保持 `imageUri ? 'photo_ai' : 'manual'`。）

- [ ] **Step 6: 轻提示订阅（可选，本屏内）**

组件挂载时订阅一次不可达提示，置一个 `serviceDown` state 显示顶部小 banner（不弹 Alert）：

```ts
  const [serviceDown, setServiceDown] = useState(false);
  useEffect(() => { subscribeServiceUnavailable(() => setServiceDown(true)); }, []);
```
（`import { subscribeServiceUnavailable } from '@/lib/styleeService';`；banner 文案"未连接本地模型服务，已用备用方案"，复用 `recognizingBanner` 样式变体。）

- [ ] **Step 7: 类型门**

Run: `npx --no-install tsc --noEmit`
Expected: 0 error

- [ ] **Step 8: Lint**

Run: `npx --no-install expo lint 2>&1 | tail -5`（无新增告警即可；lint 缺失时跳过）

- [ ] **Step 9: Commit**

```bash
git add src/app/wardrobe/add.tsx
git commit -m "feat(app): auto-standardize garment in add flow with original/standard toggle"
```

---

### Task 5: 配置、文档、集成 smoke

**Files:**
- Create: `.env.example`
- Modify/Create: `README.md`
- Create: `scripts/styleeSmoke.ts`

- [ ] **Step 1: `.env.example`**

追加（若文件不存在则创建，含现有 EXPO_PUBLIC_* 说明一行 + 新增）：

```
# 本地模型推理服务（在模型仓 style05 里 `python3 serve.py --provider dashscope` 起）
EXPO_PUBLIC_STYLEE_API=http://127.0.0.1:8000
```

- [ ] **Step 2: README 加一节**

在 README.md 末尾追加"接入本地模型服务"一节：起服务命令（模型仓 `python3 serve.py --provider dashscope`）、设 `EXPO_PUBLIC_STYLEE_API`、不可达即自动回落。

- [ ] **Step 3: 集成 smoke 脚本 `scripts/styleeSmoke.ts`**

```ts
// 用法：先在模型仓起服务，再 `node scripts/styleeSmoke.ts <图片路径>`
import { readFileSync } from 'node:fs';
import { serviceHealth, serviceRecognize, serviceStandardize, serviceRecommend } from '../src/lib/styleeService.ts';
import { toRecommendRequest } from '../src/lib/styleeMapping.ts';

const imgPath = process.argv[2] ?? 'assets/tryon/casual.png';
const b64 = readFileSync(imgPath).toString('base64');

const main = async () => {
  console.log('health:', await serviceHealth());
  const rec = await serviceRecognize(b64, 'image/png');
  console.log('recognize:', rec);
  const std = await serviceStandardize(b64, 'image/png', rec?.photo_type ?? 'flat', rec?.category ?? '上装');
  console.log('standardize:', std ? { ...std, image_ref: String(std.image_ref).slice(0, 60) } : null);
  const req = toRecommendRequest(
    [{ item_id: 't1', name: '白衬衫', category: '上装', color: '白', material: '棉', status: 'active' } as any,
     { item_id: 'b1', name: '阔腿裤', category: '下装', color: '米', status: 'active' } as any],
    { query: '周末约会', temp: '22', city: '上海', weather: '晴', stylePreferences: '法式' },
  );
  const out = await serviceRecommend(req);
  console.log('recommend outfits:', out?.outfits?.length, 'trace:', out?.trace);
};
main();
```

- [ ] **Step 4: 跑集成 smoke（需真服务在跑）**

Run（模型仓起 `python3 serve.py --provider dashscope` 后）：`node scripts/styleeSmoke.ts`
Expected: health true；recognize 有 category/photo_type；standardize 有 image_ref；recommend outfits ≥1。
（若本机未起服务：health false、其余 null —— 属预期，说明回落触发；此步"跑通"以真服务在跑为准。）

- [ ] **Step 5: 类型门 + Commit**

Run: `npx --no-install tsc --noEmit`（0 error）

```bash
git add .env.example README.md scripts/styleeSmoke.ts
git commit -m "chore(app): stylee service config, docs, and integration smoke script"
```

---

## 收尾（全部任务后）

- 最终整分支评审（sonnet，读 `scripts/review-package <base> HEAD`，base=`4a2f77b`）。
- `superpowers:finishing-a-development-branch`：**不 push**（用户 不着急 push），选"保留分支"。
- 记录 push 前欠债：对齐 origin/main（secrets.ts / 视觉重构 / 枚举）。

## Self-Review 记录

- **Spec 覆盖**：识别→T3；标准化→T3+T4；推荐→T1+T3；轻提示→T2+T4；配置/文档→T5；测试→各任务 node --test + tsc + T5 smoke。✅
- **类型一致**：`RecognizeResp/StandardizeResp/RecommendReq/RecommendResp` 在 T1 定义，T2/T3 消费；`aiStandardizeGarment` T3 产出、T4 消费。✅
- **不碰红线**：result.tsx 不动、INTENT_SYSTEM_PROMPT 不动、无新依赖、类型门 0-error。✅
