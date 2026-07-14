import type { WardrobeItem } from '@/types';
import { serviceFeature, uriToBase64 } from './styleeService';

export type GammaAction = 'generate' | 'replace_item' | 'replace_all';

export interface GammaImportItem {
  name: string;
  category: string;
  color: string;
  material?: string;
  brand?: string;
  style?: string;
  sleeve_length?: '无袖' | '短袖' | '长袖' | null;
  fit_type?: string | null;
  season?: string[];
  occasion_tags?: string[];
  photo_type: 'flatlay' | 'on_body' | 'web' | 'angled';
}

export interface GammaImportResponse {
  item: GammaImportItem;
  standardized_image_url?: string;
  standardized: boolean;
  error?: string | null;
  trace: { engine: 'gamma'; duration_ms: number; vision_model: string; edit_model: string };
}

export interface GammaOutfitItem {
  key: string;
  source: 'owned' | 'recommended';
  item_id?: string;
  name: string;
  category: string;
  color: string;
  description?: string;
  image_prompt?: string;
  image_url?: string | null;
}

export interface GammaOutfit {
  name: string;
  comment: string;
  items: GammaOutfitItem[];
}

export interface GammaOutfitResponse {
  outfit: GammaOutfit;
  trace: { engine: 'gamma'; action: GammaAction; duration_ms: number; text_model: string; image_model: string };
}

export interface GammaOutfitRequest {
  action?: GammaAction;
  instruction: string;
  wardrobe: ReturnType<typeof toGammaWardrobe>;
  weather?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  previous_outfit?: GammaOutfit;
  target_item_key?: string;
  generate_images?: boolean;
}

export interface GammaTryOnResponse {
  image_url: string;
  trace: {
    engine: 'gamma';
    image_model: string;
    input_image_count: number;
    duration_ms: number;
  };
}

export type GammaTryOnItem = Pick<
  GammaOutfitItem,
  'name' | 'category' | 'color' | 'description' | 'image_url'
>;

export function toGammaWardrobe(items: WardrobeItem[]) {
  return items.map(item => ({
    item_id: item.item_id,
    name: item.name,
    category: item.category,
    color: item.color,
    material: item.material,
    fit_type: item.fit_type,
    season: item.season,
    occasion_tags: item.occasion_tags,
    image_url: item.image_url,
  }));
}

export async function gammaImport(uri: string): Promise<GammaImportResponse | null> {
  const encoded = await uriToBase64(uri);
  if (!encoded) return null;
  return serviceFeature<GammaImportResponse>('/gamma/import', {
    image_b64: encoded.b64,
    mime: encoded.mime,
  }, 120000);
}

export async function gammaOutfit(request: GammaOutfitRequest): Promise<GammaOutfitResponse | null> {
  return serviceFeature<GammaOutfitResponse>('/gamma/outfit', request, 150000);
}

export async function gammaTryOn(
  items: GammaTryOnItem[],
  scene: string,
  selfieUri: string,
  bodyShape?: string,
): Promise<GammaTryOnResponse | null> {
  const person = selfieUri.startsWith('http://') || selfieUri.startsWith('https://')
    ? { image_url: selfieUri }
    : await uriToBase64(selfieUri).then(encoded => encoded
      ? { image_b64: encoded.b64, mime: encoded.mime }
      : null);
  if (!person) return null;
  return serviceFeature<GammaTryOnResponse>('/gamma/tryon', {
    ...person,
    scene,
    body_shape: bodyShape,
    items: items.map(item => ({
      name: item.name,
      category: item.category,
      color: item.color,
      description: item.description,
      image_url: item.image_url,
    })),
  }, 150000);
}
