import { WardrobeItem, Outfit, OutfitItem, ClothingCategory, RecommendedItem, RecognitionResult } from '@/types';
import { deepseekChat } from '@/lib/deepseek';
import { mockGetOutfitRecommendations, extractTagsFromQuery } from '@/lib/mock/recommendation';
import { mockRecognizeClothing } from '@/lib/mock/recognition';

// ─── 衣服识别 ───────────────────────────────────────────
// DeepSeek 不支持 Vision，暂时保留 mock；架构统一方便后续接入 Vision 模型

export const aiRecognizeClothing = async (imageUri: string): Promise<RecognitionResult> => {
  return mockRecognizeClothing(imageUri);
};

// Re-export static option lists used by pickers
export { CATEGORY_OPTIONS, COLOR_OPTIONS, MATERIAL_OPTIONS } from '@/lib/mock/recognition';

// ─── 意图识别 ───────────────────────────────────────────

const INTENT_SYSTEM_PROMPT = `你是一个穿搭意图识别助手。根据用户的描述，从以下标签中提取匹配的标签ID。

标签ID列表（必须使用这些ID，不要使用其他值）：
- 场合：daily, work, date, sport, party, travel, interview, ceremony, holiday, gathering
- 风格：casual, elegant, french, street, minimalist, vintage, artsy, old_money, sporty, bohemian, korean, japanese, cool, romantic
- 色系：warm, cool, neutral, black_white, pastel, earth, jewel, monochrome
- 温度：temp_hot, temp_warm, temp_cool, temp_cold

示例：
用户说"周末去约会"→ { "tags": ["date", "elegant", "warm"] }
用户说"上班穿什么"→ { "tags": ["work", "minimalist", "neutral"] }
用户说"今天很热想穿得休闲点"→ { "tags": ["casual", "temp_hot"] }
用户说"面试需要正式一点"→ { "tags": ["interview", "old_money", "neutral"] }
用户说"海边度假"→ { "tags": ["holiday", "bohemian", "warm"] }
用户说"想走文艺路线"→ { "tags": ["artsy", "vintage", "earth"] }
用户说"喜欢韩系温柔风"→ { "tags": ["korean", "romantic", "pastel"] }

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
2. 每套搭配必须包含上装和下装（或连衣裙），可选配外套/鞋/包/配饰，每套3-5件单品
3. 优先使用衣橱中已有的单品，通过ID引用（owned_item_ids）
4. 每套方案的 recommended_items 中至少推荐1件衣橱中没有的单品作为搭配补充，让穿搭更完整
5. recommended_items 中每件需要 name（名称）、category（分类：上装/下装/连衣裙/外套/鞋/包/配饰）、color（颜色）、description（简短描述，如"百搭内搭·四季"）
6. 颜色搭配协调，风格统一
7. 考虑天气和场合
8. comment 是搭配理由，2-3句话说明为什么这些单品搭配在一起好看，要具体提到颜色和风格

分类可选值：上装、下装、连衣裙、外套、鞋、包、配饰

请严格返回JSON：
{
  "outfits": [
    {
      "name": "方案名称（3-5字）",
      "owned_item_ids": ["item_id_1", "item_id_2"],
      "recommended_items": [
        {"name": "丝质围巾", "category": "配饰", "color": "米色", "description": "点睛配饰·四季"}
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
  const hasBottom = activeItems.some(i => i.category === '下装' || i.category === '连衣裙');
  if (!hasTop || !hasBottom) {
    const missing = [];
    if (!hasTop) missing.push('上装');
    if (!hasBottom) missing.push('下装');
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
        if (item.category === '下装') hasBottom = true;
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
        if (r.category === '下装') hasBottom = true;
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
