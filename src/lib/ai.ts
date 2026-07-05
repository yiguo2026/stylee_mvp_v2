import { WardrobeItem, Outfit, OutfitItem, ClothingCategory, RecommendedItem, RecognitionResult, FilterTag, OCCASION_TAGS, STYLE_TAGS, COLOR_TAGS, TEMP_TAGS } from '@/types';
import { deepseekChat } from '@/lib/deepseek';
import { qwenVisionChat, isAvailable as isDashScopeAvailable } from '@/lib/dashscope';
import { mockGetOutfitRecommendations, extractTagsFromQuery } from '@/lib/mock/recommendation';
import { mockRecognizeClothing } from '@/lib/mock/recognition';

// ─── AI 元信息 ───────────────────────────────────────────

export interface AIMeta {
  source: string;     // 模型名 或 'mock'
  durationMs: number; // 耗时毫秒
  ok: boolean;        // 是否成功拿到可用结果
}

// ─── 衣服识别 ───────────────────────────────────────────
// 优先使用 Qwen VL (DashScope)，不可用时降级到 mock

const RECOGNIZE_PROMPT = `请识别这件衣物的属性，返回JSON格式：
{
  "category": "上装/下装/连体装/外套/鞋履/包袋/帽巾/配饰",
  "color": "颜色",
  "material": "材质",
  "style": "风格",
  "sleeve_length": "无袖/短袖/长袖（仅上装需要）",
  "fit_type": "超紧身/修身/常规合身/宽松/廓形",
  "brand": "品牌（可见的话）"
}
只返回JSON，不要其他文字。`;

export const aiRecognizeClothing = async (imageUri: string): Promise<{ result: RecognitionResult; meta: AIMeta }> => {
  const t0 = Date.now();
  if (isDashScopeAvailable()) {
    try {
      const raw = await qwenVisionChat(imageUri, RECOGNIZE_PROMPT, { jsonMode: true, temperature: 0.3 });
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          result: {
            category: parsed.category || '上装',
            color: parsed.color || '未知',
            material: parsed.material || '',
            style: parsed.style || '',
            brand: parsed.brand || '',
          },
          meta: { source: 'qwen3-vl-plus', durationMs: Date.now() - t0, ok: true },
        };
      }
    } catch (e) {
      console.warn('[AI] Qwen VL recognition failed, falling back to mock:', e);
    }
  }
  const result = await mockRecognizeClothing(imageUri);
  return { result, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };
};

export const aiStandardizeGarment = async (
  imageUri: string, category: string, photoType: string,
): Promise<{ url: string | null; meta: AIMeta }> => {
  const t0 = Date.now();
  if (!isDashScopeAvailable()) return { url: null, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };

  const prompt = `将这件${category}衣物生成标准化的商品展示图，纯白背景，正面平铺，无模特，无多余装饰，高清商业摄影风格。`;

  try {
    const { qwenGenerateImage } = await import('@/lib/dashscope');
    const imageUrl = await qwenGenerateImage(prompt, { imageUrl: imageUri });
    return { url: imageUrl, meta: { source: 'qwen-image-2.0-pro', durationMs: Date.now() - t0, ok: !!imageUrl } };
  } catch (e) {
    console.warn('[AI] Qwen Image standardization failed:', e);
    return { url: null, meta: { source: 'qwen-image-2.0-pro', durationMs: Date.now() - t0, ok: false } };
  }
};

// Re-export static option lists used by pickers
export { CATEGORY_OPTIONS, COLOR_OPTIONS, MATERIAL_OPTIONS } from '@/lib/mock/recognition';

// ─── 意图识别 ───────────────────────────────────────────

const INTENT_SYSTEM_PROMPT = `你是一个穿搭意图识别助手。根据用户的描述，从以下标签中提取匹配的标签ID。

标签ID列表（必须使用这些ID，不要使用其他值）：
- 场合：daily_commute, date, travel, business, sport, ceremony, beach, hiking, home, party
- 风格：quiet_luxury, minimalist, commute_style, french, preppy, safari, vintage, street, sporty_casual, rock, goth, sweet, romantic, bohemian, western, utility, wabi_sabi, avantgarde, urban_cool
- 色系：light, nude, khaki, champagne, silver, floral, plaid, morandi, white, black_gray, red, orange, yellow, green, blue, purple, pink
- 温度：temp_hot, temp_warm, temp_cool, temp_cold

示例：
用户说"周末去约会"→ { "tags": ["date", "sweet", "warm"] }
用户说"上班穿什么"→ { "tags": ["commute", "commute_style", "minimalist"] }
用户说"今天很热想穿得休闲点"→ { "tags": ["casual", "temp_hot"] }
用户说"面试需要正式一点"→ { "tags": ["work", "quiet_luxury", "black"] }
用户说"海边度假"→ { "tags": ["travel", "bohemian", "warm"] }
用户说"想走老钱风"→ { "tags": ["quiet_luxury", "minimalist"] }
用户说"喜欢摇滚酷感"→ { "tags": ["rock", "urban_cool", "black"] }

只返回匹配的标签ID，不要翻译或修改ID。请严格返回JSON：{ "tags": ["id1", "id2"] }`;

export async function aiExtractTags(query: string): Promise<string[]> {
  if (!query.trim()) return [];

  const raw = await deepseekChat(
    [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      { role: 'user', content: query },
    ],
    { jsonMode: true, temperature: 0.3, maxTokens: 256 },
  );

  if (!raw) return extractTagsFromQuery(query);

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.tags)) return parsed.tags.filter((t: unknown) => typeof t === 'string');
  } catch {}

  return extractTagsFromQuery(query);
}

// ─── 穿搭推荐 + 穿搭理由 ────────────────────────────────

function buildItemsSummary(items: WardrobeItem[]): string {
  return items
    .filter(i => i.status === 'active')
    .map(i => {
      const parts = [`ID:${i.item_id}`, i.category, i.color];
      if (i.material) parts.push(i.material);
      if (i.fit_type) parts.push(`版型:${i.fit_type}`);
      if (i.sleeve_length) parts.push(`袖长:${i.sleeve_length}`);
      if (Array.isArray(i.season) && i.season.length) parts.push(`季节:${i.season.join('/')}`);
      const styleNames = i.tags?.map(t => t.tag_name).filter(Boolean) ?? [];
      if (styleNames.length) parts.push(`风格:${styleNames.join('/')}`);
      if (Array.isArray(i.occasion_tags) && i.occasion_tags.length) parts.push(`场合:${i.occasion_tags.join('/')}`);
      if (i.name) parts.unshift(i.name);
      return parts.join(' | ');
    })
    .join('\n');
}

// tag ID → { 中文label, 类型 }，用于把前端传来的英文标签 ID 结构化还原成中文需求
const TAG_LOOKUP: Record<string, { label: string; type: FilterTag['type'] }> = (() => {
  const map: Record<string, { label: string; type: FilterTag['type'] }> = {};
  for (const t of [...OCCASION_TAGS, ...STYLE_TAGS, ...COLOR_TAGS, ...TEMP_TAGS]) {
    map[t.id] = { label: t.label, type: t.type };
  }
  return map;
})();

interface StructuredTags { occasion: string[]; style: string[]; color: string[]; temp: string[] }

// 把 "date,khaki,temp_warm" 这类逗号拼接的 tag ID，按 场合/风格/色系/温度 拆成独立中文分组
function structureTags(tagsRaw?: string): StructuredTags {
  const result: StructuredTags = { occasion: [], style: [], color: [], temp: [] };
  if (!tagsRaw) return result;
  for (const raw of tagsRaw.split(',').map(s => s.trim()).filter(Boolean)) {
    const t = TAG_LOOKUP[raw];
    if (!t) continue;
    if (t.type === 'occasion') result.occasion.push(t.label);
    else if (t.type === 'style') result.style.push(t.label);
    else if (t.type === 'color_system') result.color.push(t.label);
    else if (t.type === 'temperature') result.temp.push(t.label);
  }
  return result;
}

// 温度数值 → 保暖度选衣指引，帮助模型把 °C 映射到单品保暖度
function tempToWarmthGuide(tempStr?: string): string | null {
  const t = parseInt(tempStr ?? '', 10);
  if (Number.isNaN(t)) return null;
  if (t >= 25) return `当前约${t}°C（炎热）：优先短袖/无袖/薄款、透气面料与凉鞋，禁止厚外套、针织、羽绒`;
  if (t >= 15) return `当前约${t}°C（温暖）：优先长袖/薄针织/衬衫，可搭薄外套或夹克，避免厚羽绒、加绒`;
  if (t >= 5) return `当前约${t}°C（凉爽）：优先针织衫、风衣/夹克等中等保暖单品，鼓励叠穿`;
  return `当前约${t}°C（寒冷）：优先厚外套/大衣/羽绒服、加厚下装与保暖配饰`;
}

const RECOMMEND_SYSTEM_PROMPT = `你是一个专业穿搭顾问。根据用户的衣橱单品和穿搭场景，生成1套最佳搭配方案。

【硬约束｜必须严格满足，违反视为无效方案】
- 温度：必须匹配"保暖度指引"。炎热天禁止厚外套/针织/羽绒；寒冷天必须包含足够保暖的外套或加厚单品。
- 场合：所选单品的正式度/风格必须贴合指定场合（如"职场商务"不搭运动裤/拖鞋；"运动健身"不搭正装/高跟鞋）。
- 颜色：若用户指定了色系，整套主色调必须落在该色系内（可少量中性色点缀），不得偏离到无关色系。
- 风格：若用户指定了风格，整套风格气质必须与之统一。

【温度→保暖度参考】
- ≥25°C 炎热：短袖/无袖/薄款、透气面料、凉鞋
- 15–24°C 温暖：长袖/薄针织/衬衫，可薄外套叠穿
- 5–14°C 凉爽：针织衫、风衣/夹克等中等保暖，鼓励叠穿
- <5°C 寒冷：厚外套/大衣/羽绒、加厚下装与保暖配饰

【搭配规则】
1. 只生成1套搭配方案，选择最贴合上述硬约束的最佳组合
2. 搭配必须包含上装和下装（或连体装），可选配外套/鞋履/包袋/帽巾/配饰，共3-5件单品
3. 优先使用衣橱中已有的单品，通过ID引用（owned_item_ids）
4. recommended_items 中可推荐1-2件衣橱中没有的单品作为搭配补充；补充单品同样要满足温度/场合/颜色/风格约束
5. recommended_items 每件需要 name、category（上装/下装/连体装/外套/鞋履/包袋/帽巾/配饰）、color、description（简短描述，如"百搭内搭·四季"）
6. comment 必须2-3句话具体说明：这套如何满足用户的温度/场合/颜色/风格需求，以及为什么好看

分类可选值：上装、下装、连体装、外套、鞋履、包袋、帽巾、配饰

请严格返回JSON：
{
  "outfits": [
    {
      "name": "方案名称（3-5字）",
      "owned_item_ids": ["item_id_1", "item_id_2"],
      "recommended_items": [
        {"name": "丝质围巾", "category": "帽巾", "color": "米色", "description": "点睛配饰·四季"}
      ],
      "comment": "搭配理由"
    }
  ]
}

【示例】
示例1（场合:职场商务 / 色系:黑灰色系 / 约22°C 温暖）→
{"outfits":[{"name":"利落通勤","owned_item_ids":["a1","a2"],"recommended_items":[{"name":"尖头乐福鞋","category":"鞋履","color":"黑色","description":"通勤利落·三季"}],"comment":"黑灰主色调稳重专业，贴合职场商务；22°C选薄西装外套+衬衫叠穿不闷热；整体极简利落。"}]}
示例2（场合:运动健身 / 约28°C 炎热）→
{"outfits":[{"name":"清爽运动","owned_item_ids":["b1","b2","b3"],"recommended_items":[],"comment":"28°C炎热选速干短袖+运动短裤，透气排汗；配跑鞋适合健身；整套机能清爽不拖沓。"}]}
示例3（场合:逛街约会 / 风格:法式慵懒 / 色系:白色系 / 约12°C 凉爽）→
{"outfits":[{"name":"法式温柔","owned_item_ids":["c1","c2"],"recommended_items":[{"name":"米白针织开衫","category":"外套","color":"米白","description":"慵懒叠穿·春秋"}],"comment":"白色系清爽干净，12°C加针织开衫保暖；碎褶半裙+开衫透着法式慵懒；约会显温柔。"}]}

重要：只返回1套最佳方案。如果衣橱单品不够完整搭配，多推荐recommended_items来补足，且补充单品必须满足全部硬约束。`;

export async function aiRecommendOutfits(
  wardrobeItems: WardrobeItem[],
  userId: string,
  sessionId: string,
  context?: { weather?: string; temp?: string; city?: string; query?: string; tags?: string; stylePreferences?: string },
): Promise<{ outfits: Outfit[]; error?: string; meta: AIMeta }> {
  const t0 = Date.now();
  const itemsSummary = buildItemsSummary(wardrobeItems);
  if (!itemsSummary) return { outfits: [], error: '衣橱中没有衣物，请先添加', meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };

  const activeItems = wardrobeItems.filter(i => i.status === 'active');
  const hasTop = activeItems.some(i => i.category === '上装' || i.category === '外套');
  const hasBottom = activeItems.some(i => i.category === '下装' || i.category === '连体装');
  if (!hasTop || !hasBottom) {
    const missing = [];
    if (!hasTop) missing.push('上装');
    if (!hasBottom) missing.push('下装或连体装');
    return { outfits: [], error: `衣橱中缺少${missing.join('和')}，建议先添加`, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };
  }

  // 需求结构化：把颜色/场合/风格/温度拆成独立字段，标签 ID 先映射回中文
  const st = structureTags(context?.tags);
  const warmthGuide = tempToWarmthGuide(context?.temp);

  const contextParts: string[] = [];
  if (context?.weather) contextParts.push(`天气：${context.weather}`);
  if (context?.temp) contextParts.push(`温度：${context.temp}°C`);
  if (warmthGuide) contextParts.push(`保暖度指引：${warmthGuide}`);
  if (context?.city) contextParts.push(`城市：${context.city}`);
  if (st.occasion.length) contextParts.push(`【场合｜硬约束】${st.occasion.join('、')}`);
  if (st.style.length) contextParts.push(`【风格｜硬约束】${st.style.join('、')}`);
  if (st.color.length) contextParts.push(`【色系｜硬约束】${st.color.join('、')}`);
  if (st.temp.length) contextParts.push(`【温度档｜硬约束】${st.temp.join('、')}`);
  if (context?.stylePreferences) contextParts.push(`用户长期风格偏好（软性参考）：${context.stylePreferences}`);
  if (context?.query) contextParts.push(`用户需求：${context.query}`);

  const userMessage = `我的衣橱单品（格式：名称 | ID | 类别 | 颜色 | 材质 | 版型 | 袖长 | 季节 | 风格 | 场合）：\n${itemsSummary}\n\n${contextParts.length > 0 ? '穿搭场景：\n' + contextParts.join('\n') : '请推荐日常搭配'}`;


  const raw = await deepseekChat(
    [
      { role: 'system', content: RECOMMEND_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    { jsonMode: true, temperature: 0.6, maxTokens: 4096 },
  );

  if (!raw) {
    const outfits = await mockGetOutfitRecommendations(wardrobeItems, userId, sessionId, undefined);
    return { outfits, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.outfits) || parsed.outfits.length === 0) {
      const outfits = await mockGetOutfitRecommendations(wardrobeItems, userId, sessionId, undefined);
      return { outfits, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };
    }

    const itemMap = new Map(wardrobeItems.map(i => [i.item_id, i]));
    const outfits: Outfit[] = [];

    for (const o of parsed.outfits) {
      const ownedIds: string[] = Array.isArray(o.owned_item_ids) ? o.owned_item_ids
        : Array.isArray(o.item_ids) ? o.item_ids : [];

      const outfitItems: OutfitItem[] = [];
      let order = 0;
      let hasTop = false;
      let hasBottom = false;

      for (const id of ownedIds as string[]) {
        const item = itemMap.get(id);
        if (!item) continue;
        if (item.category === '上装' || item.category === '外套') hasTop = true;
        if (item.category === '下装' || item.category === '连体装') hasBottom = true;
        outfitItems.push({
          item_id: id,
          outfit_id: '',
          display_order: order++,
          item,
        });
      }

      const recommended: RecommendedItem[] = Array.isArray(o.recommended_items)
        ? o.recommended_items.map((r: any) => ({
            name: String(r.name || ''),
            category: String(r.category || '配饰') as ClothingCategory,
            color: String(r.color || ''),
            image_url: r.image_url ? String(r.image_url) : undefined,
            description: r.description ? String(r.description) : undefined,
          }))
        : [];

      for (const r of recommended) {
        if (r.category === '上装' || r.category === '外套') hasTop = true;
        if (r.category === '下装' || r.category === '连体装') hasBottom = true;
      }

      if (!hasTop && !hasBottom && outfitItems.length === 0 && recommended.length === 0) continue;

      const outfit_id = `ai_outfit_${outfits.length}_${Date.now()}`;
      outfits.push({
        outfit_id,
        user_id: userId,
        session_id: sessionId,
        name: o.name || `方案 ${outfits.length + 1}`,
        ai_comment: o.comment || '',
        source: 'ai_generated',
        items: outfitItems.map(i => ({ ...i, outfit_id })),
        recommended_items: recommended.length > 0 ? recommended : undefined,
        created_at: new Date().toISOString(),
      });
    }

    if (outfits.length === 0) {
      const fallback = await mockGetOutfitRecommendations(wardrobeItems, userId, sessionId, undefined);
      return { outfits: fallback, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };
    }

    return { outfits, meta: { source: 'deepseek-v4-flash', durationMs: Date.now() - t0, ok: true } };
  } catch {
    const outfits = await mockGetOutfitRecommendations(wardrobeItems, userId, sessionId, undefined);
    return { outfits, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };
  }
}

// ─── 穿搭理由（独立生成）─────────────────────────────────

const REASON_SYSTEM_PROMPT = `你是一个穿搭顾问。根据给定的搭配方案和场景，生成一段2-3句话的搭配理由，要具体提到颜色协调、风格统一、场景适配等方面。请严格返回JSON：{ "reason": "搭配理由" }`;

export async function aiGetOutfitReason(
  outfitItems: WardrobeItem[],
  context?: { weather?: string; temp?: string; query?: string },
): Promise<string | null> {
  const itemsDesc = outfitItems.map(i => `${i.name || i.category}（${i.color}）`).join('、');
  const contextParts: string[] = [];
  if (context?.weather) contextParts.push(`天气${context.weather}`);
  if (context?.temp) contextParts.push(`${context.temp}°C`);
  if (context?.query) contextParts.push(context.query);

  const userMessage = `搭配单品：${itemsDesc}\n场景：${contextParts.join('，') || '日常'}`;

  const raw = await deepseekChat(
    [
      { role: 'system', content: REASON_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    { jsonMode: true, temperature: 0.8, maxTokens: 512 },
  );

  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.reason === 'string' ? parsed.reason : null;
  } catch {
    return null;
  }
}

// ─── 链接导入商品识别 ──────────────────────────────────────

export interface ProductExtraction {
  name: string;
  category: ClothingCategory;
  color: string;
  material?: string;
  brand?: string;
  price?: number;
  description?: string;
}

const LINK_EXTRACT_PROMPT = `根据以下商品链接URL，推断商品信息并返回JSON：
{
  "name": "商品名称",
  "category": "上装/下装/连体装/外套/鞋履/包袋/帽巾/配饰",
  "color": "颜色",
  "material": "材质（可选）",
  "brand": "品牌（可选）",
  "price": 价格数字（可选）,
  "description": "简短描述（可选）"
}
只返回JSON。如果无法确定某字段，留空字符串。`;

export async function aiExtractProductFromLink(url: string): Promise<ProductExtraction | null> {
  try {
    const raw = await deepseekChat(
      [
        { role: 'system', content: LINK_EXTRACT_PROMPT },
        { role: 'user', content: `商品链接：${url}` },
      ],
      { jsonMode: true, temperature: 0.3, maxTokens: 512 },
    );
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        name: parsed.name || '链接导入商品',
        category: parsed.category || '上装',
        color: parsed.color || '未知',
        material: parsed.material || undefined,
        brand: parsed.brand || undefined,
        price: parsed.price || undefined,
        description: parsed.description || undefined,
      };
    }
  } catch {}

  return {
    name: '链接导入商品',
    category: '上装',
    color: '未知',
    description: `来自 ${url.split('/')[2] ?? '未知网站'}`,
  };
}

// ─── AI 试穿建议 ──────────────────────────────────────────

export interface TryOnSuggestion {
  suggestion: string;
  compatibility_score: number;
  tips: string[];
}

type ItemBrief = Pick<WardrobeItem, 'name' | 'category' | 'color'>;

export async function aiGenerateTryOnSuggestion(
  outfitItems: ItemBrief[],
  bodyShape?: string,
): Promise<{ suggestion: TryOnSuggestion; meta: AIMeta }> {
  const t0 = Date.now();
  const itemsDesc = outfitItems.map(i => `${i.name || i.category}（${i.color}）`).join('、');

  const systemPrompt = `你是一个专业穿搭顾问。根据搭配单品和用户体型，给出试穿建议。
返回JSON：
{
  "suggestion": "2-3句试穿效果描述，具体提到颜色搭配和风格",
  "compatibility_score": 85,
  "tips": ["穿搭小贴士1", "穿搭小贴士2", "穿搭小贴士3"]
}`;

  const bodyInfo = bodyShape ? `\n用户体型：${bodyShape}` : '';
  const userMsg = `搭配单品：${itemsDesc}${bodyInfo}`;

  try {
    const raw = await deepseekChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      { jsonMode: true, temperature: 0.8, maxTokens: 1024 },
    );
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        suggestion: {
          suggestion: parsed.suggestion ?? '这套搭配整体协调，适合日常穿着。',
          compatibility_score: parsed.compatibility_score ?? 80,
          tips: Array.isArray(parsed.tips) ? parsed.tips : ['搭配和谐', '颜色协调'],
        },
        meta: { source: 'deepseek-v4-flash', durationMs: Date.now() - t0, ok: true },
      };
    }
  } catch {}

  return {
    suggestion: {
      suggestion: '这套搭配色彩协调，风格统一，整体效果不错。单品质感搭配合理，适合多种场合。',
      compatibility_score: 82,
      tips: ['可以加一条围巾增加层次感', '建议搭配简约配饰', '适合日常通勤和休闲场景'],
    },
    meta: { source: 'deepseek-v4-flash', durationMs: Date.now() - t0, ok: false },
  };
}

// ─── AI 试穿图生成 ──────────────────────────────────────────

const SCENE_PROMPTS: Record<string, string> = {
  cafe: '坐在咖啡馆里，暖色调灯光，悠闲氛围',
  street: '站在城市街头，自然光线，都市感',
  office: '在办公室内，专业场景，干净光线',
  park: '在公园草地旁，自然阳光，绿意盎然',
  home: '在家中沙发上，温馨居家氛围，柔和光线',
};

export async function aiGenerateTryOnImage(
  outfitItems: ItemBrief[],
  bodyShape?: string,
  scene?: string,
): Promise<{ url: string | null; meta: AIMeta }> {
  const t0 = Date.now();
  if (!isDashScopeAvailable()) return { url: null, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };

  const itemsDesc = outfitItems.map(i => `${i.color}${i.name || i.category}`).join('、');
  const bodyDesc = bodyShape ? `，${bodyShape}身材` : '';
  const sceneDesc = scene && SCENE_PROMPTS[scene] ? `，${SCENE_PROMPTS[scene]}` : '，站在城市街头，自然光线';

  const prompt = `时尚穿搭照片，一位${bodyDesc}的年轻女性穿着${itemsDesc}${sceneDesc}，全身照，时尚杂志风格，高质量摄影`;

  try {
    const { qwenGenerateImage } = await import('@/lib/dashscope');
    const imageUrl = await qwenGenerateImage(prompt);
    return { url: imageUrl, meta: { source: 'qwen-image-2.0-pro', durationMs: Date.now() - t0, ok: !!imageUrl } };
  } catch (e) {
    console.warn('[AI] Try-on image generation failed:', e);
    return { url: null, meta: { source: 'qwen-image-2.0-pro', durationMs: Date.now() - t0, ok: false } };
  }
}
