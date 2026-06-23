import { WardrobeItem, Outfit, OutfitItem, ClothingCategory, RecommendedItem, RecognitionResult } from '@/types';
import { deepseekChat } from '@/lib/deepseek';
import { arkVision, arkGenerateImage, isAvailable as isArkAvailable } from '@/lib/ark';
import { mockGetOutfitRecommendations, extractTagsFromQuery } from '@/lib/mock/recommendation';
import { mockRecognizeClothing } from '@/lib/mock/recognition';

// ─── 衣服识别 ───────────────────────────────────────────
// 优先使用 Ark Vision 多模态模型，不可用时降级到 mock

const RECOGNIZE_PROMPT = `请识别这件衣物的属性，返回JSON格式：
{
  "category": "上装/下装/连体装/外套/鞋/包/帽子/围巾",
  "color": "颜色",
  "material": "材质",
  "style": "风格",
  "sleeve_length": "无袖/短袖/长袖（仅上装需要）",
  "fit_type": "紧身/修身/宽松/标准/oversize",
  "brand": "品牌（可见的话）"
}
只返回JSON，不要其他文字。`;

export const aiRecognizeClothing = async (imageUri: string): Promise<RecognitionResult> => {
  if (isArkAvailable()) {
    try {
      const raw = await arkVision(imageUri, RECOGNIZE_PROMPT, { jsonMode: true, temperature: 0.3 });
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          category: parsed.category || '上装',
          color: parsed.color || '未知',
          material: parsed.material || '',
          style: parsed.style || '',
          brand: parsed.brand || '',
        };
      }
    } catch (e) {
      console.warn('[AI] Ark vision recognition failed, falling back to mock:', e);
    }
  }
  return mockRecognizeClothing(imageUri);
};

// Re-export static option lists used by pickers
export { CATEGORY_OPTIONS, COLOR_OPTIONS, MATERIAL_OPTIONS } from '@/lib/mock/recognition';

// ─── 意图识别 ───────────────────────────────────────────

const INTENT_SYSTEM_PROMPT = `你是一个穿搭意图识别助手。根据用户的描述，从以下标签中提取匹配的标签ID。

标签ID列表（必须使用这些ID，不要使用其他值）：
- 场合：commute, date, travel, casual, work, sport
- 风格：korean, sweet, new_chinese, preppy, city_chic, artsy, sporty_casual, commute_style, french, maillard, japanese, business, american, british
- 色系：black, white, gray, blue, green, warm, morandi, clash
- 温度：temp_hot, temp_warm, temp_cool, temp_cold

示例：
用户说"周末去约会"→ { "tags": ["date", "sweet", "warm"] }
用户说"上班穿什么"→ { "tags": ["commute", "commute_style", "morandi"] }
用户说"今天很热想穿得休闲点"→ { "tags": ["casual", "temp_hot"] }
用户说"面试需要正式一点"→ { "tags": ["work", "business", "black"] }
用户说"海边度假"→ { "tags": ["travel", "french", "warm"] }
用户说"想走文艺路线"→ { "tags": ["artsy", "new_chinese", "morandi"] }
用户说"喜欢韩系温柔风"→ { "tags": ["korean", "sweet", "warm"] }

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
      if (i.name) parts.unshift(i.name);
      return parts.join(' | ');
    })
    .join('\n');
}

const RECOMMEND_SYSTEM_PROMPT = `你是一个专业穿搭顾问。根据用户的衣橱单品和穿搭场景，生成恰好3套搭配方案。

规则：
1. 必须生成3套完整搭配方案，风格要有差异（如休闲/正式/个性）
2. 每套搭配必须包含上装和下装（或连体装），可选配外套/鞋/包/帽子/围巾，每套3-5件单品
3. 优先使用衣橱中已有的单品，通过ID引用（owned_item_ids）
4. 每套方案的 recommended_items 中至少推荐1件衣橱中没有的单品作为搭配补充，让穿搭更完整
5. recommended_items 中每件需要 name（名称）、category（分类：上装/下装/连体装/外套/鞋/包/帽子/围巾）、color（颜色）、description（简短描述，如"百搭内搭·四季"）
6. 颜色搭配协调，风格统一
7. 考虑天气和场合
8. comment 是搭配理由，2-3句话说明为什么这些单品搭配在一起好看，要具体提到颜色和风格

分类可选值：上装、下装、连体装、外套、鞋、包、帽子、围巾

请严格返回JSON：
{
  "outfits": [
    {
      "name": "方案名称（3-5字）",
      "owned_item_ids": ["item_id_1", "item_id_2"],
      "recommended_items": [
        {"name": "丝质围巾", "category": "围巾", "color": "米色", "description": "点睛配饰·四季"}
      ],
      "comment": "搭配理由"
    }
  ]
}

重要：必须返回3套方案。如果衣橱单品不够3套完整搭配，多推荐recommended_items来补足。`;

export async function aiRecommendOutfits(
  wardrobeItems: WardrobeItem[],
  userId: string,
  sessionId: string,
  context?: { weather?: string; temp?: string; city?: string; query?: string; tags?: string; stylePreferences?: string },
): Promise<{ outfits: Outfit[]; error?: string }> {
  const itemsSummary = buildItemsSummary(wardrobeItems);
  if (!itemsSummary) return { outfits: [], error: '衣橱中没有衣物，请先添加' };

  const activeItems = wardrobeItems.filter(i => i.status === 'active');
  const hasTop = activeItems.some(i => i.category === '上装' || i.category === '外套');
  const hasBottom = activeItems.some(i => i.category === '下装' || i.category === '连体装');
  if (!hasTop || !hasBottom) {
    const missing = [];
    if (!hasTop) missing.push('上装');
    if (!hasBottom) missing.push('下装或连体装');
    return { outfits: [], error: `衣橱中缺少${missing.join('和')}，建议先添加` };
  }

  const contextParts: string[] = [];
  if (context?.weather) contextParts.push(`天气：${context.weather}`);
  if (context?.temp) contextParts.push(`温度：${context.temp}°C`);
  if (context?.city) contextParts.push(`城市：${context.city}`);
  if (context?.tags) contextParts.push(`标签：${context.tags}`);
  if (context?.stylePreferences) contextParts.push(`用户风格偏好：${context.stylePreferences}`);
  if (context?.query) contextParts.push(`用户需求：${context.query}`);

  const userMessage = `我的衣橱单品：\n${itemsSummary}\n\n${contextParts.length > 0 ? '穿搭场景：' + contextParts.join('，') : '请推荐日常搭配'}`;

  const raw = await deepseekChat(
    [
      { role: 'system', content: RECOMMEND_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    { jsonMode: true, temperature: 1, maxTokens: 4096 },
  );

  if (!raw) {
    return { outfits: await mockGetOutfitRecommendations(wardrobeItems, userId, sessionId, undefined) };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.outfits) || parsed.outfits.length === 0) {
      return { outfits: await mockGetOutfitRecommendations(wardrobeItems, userId, sessionId, undefined) };
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

      // Also count recommended items toward top/bottom check
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

      // Allow outfits with recommended items even if no owned top/bottom yet
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
      return { outfits: await mockGetOutfitRecommendations(wardrobeItems, userId, sessionId, undefined) };
    }

    return { outfits };
  } catch {
    return { outfits: await mockGetOutfitRecommendations(wardrobeItems, userId, sessionId, undefined) };
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
  "category": "上装/下装/连体装/外套/鞋/包/帽子/围巾",
  "color": "颜色",
  "material": "材质（可选）",
  "brand": "品牌（可选）",
  "price": 价格数字（可选）,
  "description": "简短描述（可选）"
}
只返回JSON。如果无法确定某字段，留空字符串。`;

export async function aiExtractProductFromLink(url: string): Promise<ProductExtraction | null> {
  // 尝试用 DeepSeek 从 URL 文本推断
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

  // Mock fallback
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

export async function aiGenerateTryOnSuggestion(
  outfitItems: WardrobeItem[],
  bodyShape?: string,
): Promise<TryOnSuggestion | null> {
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
        suggestion: parsed.suggestion ?? '这套搭配整体协调，适合日常穿着。',
        compatibility_score: parsed.compatibility_score ?? 80,
        tips: Array.isArray(parsed.tips) ? parsed.tips : ['搭配和谐', '颜色协调'],
      };
    }
  } catch {}

  // Mock fallback
  return {
    suggestion: '这套搭配色彩协调，风格统一，整体效果不错。单品质感搭配合理，适合多种场合。',
    compatibility_score: 82,
    tips: ['可以加一条围巾增加层次感', '建议搭配简约配饰', '适合日常通勤和休闲场景'],
  };
}

// ─── AI 试穿图生成 ──────────────────────────────────────────

export async function aiGenerateTryOnImage(
  outfitItems: WardrobeItem[],
  bodyShape?: string,
): Promise<string | null> {
  const itemsDesc = outfitItems.map(i => `${i.color}${i.name || i.category}`).join('、');
  const bodyDesc = bodyShape ? `，${bodyShape}身材` : '';

  const prompt = `时尚穿搭照片，一位${bodyDesc}的年轻女性穿着${itemsDesc}，站在城市街头，自然光线，全身照，时尚杂志风格，高质量摄影`;

  try {
    const imageUrl = await arkGenerateImage(prompt);
    if (imageUrl) return imageUrl;
  } catch (e) {
    console.warn('[AI] Try-on image generation failed:', e);
  }

  return null;
}
