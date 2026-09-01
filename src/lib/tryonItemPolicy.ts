import type { ClothingCategory, SleeveLength } from '@/types';

export interface TryOnItemInput {
  name?: string;
  category?: string;
  color?: string;
  material?: string;
  sleeve_length?: SleeveLength;
  fit_type?: string;
  description?: string;
  image_url?: string | null;
  ai_recognized_attrs?: Record<string, unknown> | null;
  reference_blocked?: boolean;
}

export interface TryOnItemBrief {
  name: string;
  category: ClothingCategory;
  color: string;
  material?: string;
  sleeve_length?: SleeveLength;
  fit_type?: string;
  description?: string;
  image_url?: string;
  reference_blocked: boolean;
}

export function buildTryOnItemBrief(item: TryOnItemInput): TryOnItemBrief {
  const attrs = item.ai_recognized_attrs;
  const referenceBlocked = item.reference_blocked === true || (
    attrs?.async_import === true
      && attrs?.standardization_ok === false
      && attrs?.standardization === 'fallback_original'
      && attrs?.user_confirmed_original !== true
  );
  const recognizedDescription = typeof attrs?.description === 'string'
    ? attrs.description.trim()
    : '';
  return {
    name: item.name ?? '',
    category: (item.category ?? '上装') as ClothingCategory,
    color: item.color ?? '',
    material: item.material || undefined,
    sleeve_length: item.sleeve_length,
    fit_type: item.fit_type || undefined,
    description: item.description || recognizedDescription || undefined,
    image_url: referenceBlocked ? undefined : (item.image_url || undefined),
    reference_blocked: referenceBlocked,
  };
}

export function decideTryOnGeneration(imageUrl: string | null | undefined):
  | { ok: true; imageUrl: string }
  | { ok: false } {
  return imageUrl ? { ok: true, imageUrl } : { ok: false };
}
