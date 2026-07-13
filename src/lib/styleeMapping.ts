import type { WardrobeItem, Outfit, OutfitItem, RecommendedItem, RecognitionResult, ClothingCategory, FitType, SleeveLength } from '@/types';

export interface RecognizeResp {
  category: string; color: string; material: string; style: string;
  brand: string; photo_type: string; needs_review: boolean; confidence: number;
  fit_type?: string; sleeve_length?: string; season?: string[]; occasion_tags?: string[];
  provider?: string;
}
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
