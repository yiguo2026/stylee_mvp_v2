import { WardrobeItem, Outfit, ClothingCategory, RecognitionResult, DetectedItem, normalizeColor, normalizeMaterial } from '@/types';
import { mockGetOutfitRecommendations, extractTagsFromQuery } from '@/lib/mock/recommendation';
import { mockRecognizeClothing } from '@/lib/mock/recognition';
import { buildFallbackLook } from '@/lib/fallbackLook';
import { serviceFeature, serviceRecognize, serviceRecognizeMulti, serviceRecommend, serviceStandardize, uriToBase64 } from '@/lib/styleeService';
import { outfitsRespToApp, recognizeRespToResult, toRecommendRequest } from '@/lib/styleeMapping';

// ─── AI 元信息 ───────────────────────────────────────────

export interface AIMeta {
  source: string;     // 模型名 或 'mock'
  durationMs: number; // 耗时毫秒
  ok: boolean;        // 是否成功拿到可用结果
}

// ─── 衣服识别 ───────────────────────────────────────────
// 所有 Qwen/DeepSeek 请求只由 model-service 发起；App 永不持有模型 key。

export const aiRecognizeClothing = async (imageUri: string): Promise<{ result: RecognitionResult; meta: AIMeta }> => {
  const t0 = Date.now();
  const encoded = await uriToBase64(imageUri);
  const response = encoded ? await serviceRecognize(encoded.b64, encoded.mime) : null;
  if (response) {
    const result = recognizeRespToResult(response);
    result.color = normalizeColor(result.color);
    result.material = normalizeMaterial(result.material);
    const provider = response.provider || 'model';
    return { result, meta: { source: `model-service/${provider}`, durationMs: Date.now() - t0, ok: provider !== 'mock' } };
  }
  const result = await mockRecognizeClothing(imageUri);
  return { result, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };
};

// ─── 多品识别 ────────────────────────────────────────────

export const aiDetectMultiItems = async (
  imageUri: string,
): Promise<{ items: DetectedItem[]; meta: AIMeta }> => {
  const t0 = Date.now();
  const encoded = await uriToBase64(imageUri);
  const parsed = encoded ? await serviceRecognizeMulti(encoded.b64, encoded.mime) : null;
  if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
          const items: DetectedItem[] = parsed.items.map((p: any, i: number) => ({
            index: p.index ?? i + 1,
            category: p.category || '上装',
            color: normalizeColor(p.color),
            material: normalizeMaterial(p.material),
            style: p.style || undefined,
            brand: p.brand || undefined,
            sleeve_length: p.sleeve_length || undefined,
            fit_type: p.fit_type || undefined,
            season: Array.isArray(p.season) ? p.season : undefined,
            occasion_tags: Array.isArray(p.occasion_tags) ? p.occasion_tags : undefined,
            description: p.description || `${p.color || '未知'}${p.category || '单品'}`,
          }));
          const provider = parsed.provider || 'model';
          return { items, meta: { source: `model-service/${provider}`, durationMs: Date.now() - t0, ok: provider !== 'mock' } };
  }
  // Fallback: use single-item recognition, wrap as array
  const { result, meta: singleMeta } = await aiRecognizeClothing(imageUri);
  return {
    items: [{
      index: 1,
      ...result,
      description: result.style ? `${result.color}${result.category}·${result.style}` : `${result.color}${result.category}`,
    }],
    meta: singleMeta,
  };
};

export const aiStandardizeGarment = async (
  imageUri: string, category: string, photoType: string,
  extras?: { color?: string; material?: string; description?: string },
): Promise<{ url: string | null; meta: AIMeta }> => {
  const t0 = Date.now();
  const encoded = await uriToBase64(imageUri);
  const response = encoded
    ? await serviceStandardize(encoded.b64, encoded.mime, photoType, category, extras)
    : null;
  const usable = response?.verified && response.image_ref?.startsWith('http')
    ? response.image_ref : null;
  return { url: usable, meta: { source: usable ? 'model-service/qwen-image-edit' : 'mock', durationMs: Date.now() - t0, ok: !!usable } };
};

// Re-export static option lists used by pickers
export { CATEGORY_OPTIONS, COLOR_OPTIONS, MATERIAL_OPTIONS } from '@/lib/mock/recognition';

// ─── 意图识别 ───────────────────────────────────────────

export async function aiExtractTags(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const parsed = await serviceFeature<{ tags?: unknown[] }>('/intent', { query }, 30000);
  if (Array.isArray(parsed?.tags)) return parsed.tags.filter((t): t is string => typeof t === 'string');

  return extractTagsFromQuery(query);
}

// ─── 穿搭推荐 + 穿搭理由 ────────────────────────────────

export async function aiRecommendOutfits(
  wardrobeItems: WardrobeItem[],
  userId: string,
  sessionId: string,
  context?: { weather?: string; temp?: string; city?: string; query?: string; tags?: string; stylePreferences?: string },
): Promise<{ outfits: Outfit[]; error?: string; meta: AIMeta }> {
  const t0 = Date.now();
  const serviceResult = await serviceRecommend(toRecommendRequest(wardrobeItems, context));
  if (Array.isArray(serviceResult?.outfits)) {
    const serviceOutfits = outfitsRespToApp(serviceResult.outfits, wardrobeItems, userId, sessionId);
    if (serviceOutfits.length > 0) {
      return {
        outfits: serviceOutfits,
        meta: { source: `model-service/${serviceResult.trace?.provider || 'model'}`, durationMs: Date.now() - t0, ok: serviceResult.trace?.provider !== 'mock' },
      };
    }
  }
  const activeItems = wardrobeItems.filter(i => i.status === 'active');
  const hasTop = activeItems.some(i => i.category === '上装' || i.category === '外套');
  const hasBottom = activeItems.some(i => i.category === '下装' || i.category === '连体装');
  const hasDress = activeItems.some(i => i.category === '连体装');

  // 方案A：空 / 稀疏衣橱不再直接返回空态，改为本地"全品类混搭"兜底：
  // 用已有单品 + 推荐单品库补位，凑成一套完整 look。
  if (activeItems.length === 0 || (!hasTop && !hasDress) || (!hasBottom && !hasDress)) {
    return {
      outfits: [buildFallbackLook(activeItems, userId, sessionId)],
      meta: { source: 'fallback', durationMs: Date.now() - t0, ok: true },
    };
  }

  const outfits = await mockGetOutfitRecommendations(wardrobeItems, userId, sessionId, undefined);
  return { outfits, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };
}

// ─── 穿搭理由（独立生成）─────────────────────────────────

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

  const parsed = await serviceFeature<{ reason?: string }>('/reason', {
    items: itemsDesc, context: contextParts.join('，') || '日常', userMessage,
  });
  return typeof parsed?.reason === 'string' ? parsed.reason : null;
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

export async function aiExtractProductFromLink(url: string): Promise<ProductExtraction | null> {
  try {
    const parsed = await serviceFeature<any>('/product-extract', { url });
    if (parsed) {
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

  const bodyInfo = bodyShape ? `\n用户体型：${bodyShape}` : '';
  const userMsg = `搭配单品：${itemsDesc}${bodyInfo}`;

  try {
    const parsed = await serviceFeature<any>('/tryon-suggestion', {
      items: outfitItems, body_shape: bodyShape, user_message: userMsg,
    });
    if (parsed && parsed.provider !== 'mock') {
      return {
        suggestion: {
          suggestion: parsed.suggestion ?? '这套搭配整体协调，适合日常穿着。',
          compatibility_score: parsed.compatibility_score ?? 80,
          tips: Array.isArray(parsed.tips) ? parsed.tips : ['搭配和谐', '颜色协调'],
        },
        meta: { source: `model-service/${parsed.provider || 'deepseek'}`, durationMs: Date.now() - t0, ok: true },
      };
    }
  } catch {}

  return {
    suggestion: {
      suggestion: '这套搭配色彩协调，风格统一，整体效果不错。单品质感搭配合理，适合多种场合。',
      compatibility_score: 82,
      tips: ['可以加一条围巾增加层次感', '建议搭配简约配饰', '适合日常通勤和休闲场景'],
    },
    meta: { source: 'mock', durationMs: Date.now() - t0, ok: false },
  };
}

// ─── AI 试穿图生成 ──────────────────────────────────────────

export async function aiGenerateTryOnImage(
  outfitItems: ItemBrief[],
  bodyShape?: string,
  scene?: string,
  selfieUri?: string | null,
): Promise<{ url: string | null; meta: AIMeta }> {
  const t0 = Date.now();

  const encoded = selfieUri ? await uriToBase64(selfieUri) : null;
  if (!encoded) return { url: null, meta: { source: 'mock', durationMs: Date.now() - t0, ok: false } };
  const response = await serviceFeature<{ image_ref?: string }>('/tryon-image', {
    image_b64: encoded.b64, mime: encoded.mime,
    items: outfitItems, body_shape: bodyShape, scene,
  }, 120000);
  const imageUrl = response?.image_ref || null;
  return { url: imageUrl, meta: { source: imageUrl ? 'model-service/qwen-image-edit' : 'mock', durationMs: Date.now() - t0, ok: !!imageUrl } };
}
