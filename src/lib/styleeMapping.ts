import type { WardrobeItem, Outfit, OutfitItem, RecommendedItem, RecognitionResult, ClothingCategory, FitType, SleeveLength, PhotoType, DetectedItem } from '@/types';

export interface RecognizeResp {
  category: string; color: string; material: string; style: string;
  brand: string; photo_type: string; needs_review: boolean; confidence: number;
  fit_type?: string; sleeve_length?: string; season?: string[]; occasion_tags?: string[];
  provider?: string;
}
export interface RecognizeManyItemResp {
  index?: number; category?: string; color?: string; material?: string; style?: string;
  brand?: string; photo_type?: string; needs_review?: boolean; confidence?: number;
  fit_type?: string; sleeve_length?: string; season?: string[]; occasion_tags?: string[];
  description?: string;
}
export interface RecognizeManyResp { items: RecognizeManyItemResp[]; provider?: string; }
export interface StandardizeResp { image_ref: string; method: string; verified: boolean; provider?: string; }
export interface RecommendReqItem {
  item_id: string; name: string; category: string; color: string;
  material?: string; sleeve_length?: string; fit?: string; season?: string[]; occasion_tags?: string[];
}
export interface RecommendReq {
  input_mode: 'nl'; query: string; n: number;
  tags?: string[];
  profile: { gender?: string; body_shape?: string; skin_tone?: string; style_prefs?: string[] };
  weather: { temp_c?: number; condition?: string; city?: string; time_of_day?: string };
  wardrobe: RecommendReqItem[];
}
export interface RecommendRespOutfit {
  name: string; owned_item_ids: string[];
  recommended_items: { name: string; category: string; color: string; description?: string }[];
  comment: string;
}
export interface RecommendResp { outfits: RecommendRespOutfit[]; trace?: { rag_mode?: string; pool?: number; provider?: string }; }

export type RecommendContext = {
  weather?: string; temp?: string; city?: string; query?: string; tags?: string; stylePreferences?: string;
};

/** Normalize legacy/client aliases to the model-service PhotoType contract. */
export function normalizePhotoType(value?: string | null): PhotoType {
  if (value === 'flat' || value === 'flatlay') return 'flatlay';
  if (value === 'product' || value === 'web') return 'web';
  if (value === 'angled') return 'angled';
  return 'on_body';
}

export function recognizeManyItemToDetected(item: RecognizeManyItemResp, index: number): DetectedItem {
  return {
    index: item.index ?? index + 1,
    category: String(item.category || '上装') as ClothingCategory,
    color: String(item.color || ''),
    material: item.material || undefined,
    style: item.style || undefined,
    brand: item.brand || undefined,
    sleeve_length: item.sleeve_length ? item.sleeve_length as SleeveLength : undefined,
    fit_type: item.fit_type ? item.fit_type as FitType : undefined,
    season: Array.isArray(item.season) ? item.season : undefined,
    occasion_tags: Array.isArray(item.occasion_tags) ? item.occasion_tags : undefined,
    photo_type: normalizePhotoType(item.photo_type),
    needs_review: item.needs_review ?? false,
    confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
    description: item.description || `${item.color || '未知'}${item.category || '单品'}`,
  };
}

const RECOMMENDED_ITEM_TERMS = [
  '牛仔短裤', '牛仔长裤', '牛仔裤', '西装长裤', '半身裙', '连衣裙',
  '针织衫', '防晒衫', '白衬衫', '衬衫', 'T恤', '背心', '吊带', '卫衣',
  '毛衣', '上衣', '短裤', '长裤', '阔腿裤', '运动裤', '外套', '夹克',
  '风衣', '西装', '帆布鞋', '运动鞋', '小白鞋', '凉鞋', '拖鞋', '乐福鞋',
  '高跟鞋', '鞋', '托特包', '斜挎包', '双肩包', '包', '草帽', '帽子',
  '丝巾', '围巾', '墨镜', '耳饰', '项链', '手链', '腰带',
];

/** 兼容旧服务响应：把“补：建议购买一件……”压成简短单品名。 */
export function compactRecommendedName(value: string, category = '单品'): string {
  let text = String(value || '').trim()
    .replace(/^补\s*[:：]?\s*/, '')
    .replace(/^(?:建议|推荐|可以|可|请|考虑)?\s*(?:购买|选择|搭配|准备)?\s*(?:一件|一条|一双|一个|一顶|一款|一套|一只)?\s*/, '')
    .split(/[，,。；;！!]/, 1)[0]
    .trim();

  let bestEnd = -1;
  for (const term of RECOMMENDED_ITEM_TERMS) {
    const idx = text.lastIndexOf(term);
    if (idx >= 0) bestEnd = Math.max(bestEnd, idx + term.length);
  }
  if (bestEnd >= 0) {
    text = text.slice(Math.max(0, bestEnd - 12), bestEnd);
    const lastDe = text.lastIndexOf('的');
    if (lastDe >= 0) text = text.slice(lastDe + 1);
  }
  text = text.trim().replace(/^[-—:：·]+|[-—:：·]+$/g, '');
  if (text.length > 12) {
    text = text.slice(-12);
    const lastDe = text.lastIndexOf('的');
    if (lastDe >= 0) text = text.slice(lastDe + 1);
  }
  return text || category || '单品';
}

export function recognizeRespToResult(resp: RecognizeResp): RecognitionResult {
  return {
    category: (resp.category || '上装') as ClothingCategory,
    color: resp.color || '未知',
    material: resp.material || '',
    style: resp.style || '',
    brand: resp.brand || '',
    photo_type: normalizePhotoType(resp.photo_type),
    needs_review: resp.needs_review ?? undefined,
    confidence: typeof resp.confidence === 'number' ? resp.confidence : undefined,
    fit_type: resp.fit_type ? resp.fit_type as FitType : undefined,
    sleeve_length: resp.sleeve_length ? resp.sleeve_length as SleeveLength : undefined,
    season: Array.isArray(resp.season) ? resp.season : undefined,
    occasion_tags: Array.isArray(resp.occasion_tags) ? resp.occasion_tags : undefined,
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
    tags: (context?.tags || '').split(',').map(s => s.trim()).filter(Boolean),
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
          name: compactRecommendedName(String(r.name || ''), String(r.category || '配饰')),
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
