import type { OutfitLayoutRole } from '@/types';

export type OutfitCanvasRole = OutfitLayoutRole;

export type OutfitCanvasZone = 'core' | 'head' | 'neck' | 'carry' | 'micro' | 'foot';

export interface OutfitCanvasLayoutItem {
  id: string;
  name: string;
  category: string;
  layoutRole?: OutfitCanvasRole;
  imageUri?: string | null;
  imageSource?: unknown;
  owned?: boolean;
}

export interface OutfitCanvasPlacement {
  item: OutfitCanvasLayoutItem;
  role: OutfitCanvasRole;
  zone: OutfitCanvasZone;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

type PlacementShape = Omit<OutfitCanvasPlacement, 'item' | 'role'>;
type LayoutEntry = { item: OutfitCanvasLayoutItem; role: OutfitCanvasRole };

const OUTFIT_CANVAS_ROLES = new Set<OutfitCanvasRole>([
  'base',
  'mid',
  'outer',
  'dress',
  'bottom',
  'shoes',
  'bag',
  'hat',
  'scarf',
  'accessory',
]);

const ACCESSORY_SHAPES = {
  hat: { zone: 'head', left: 78, top: 3, width: 18, height: 15, rotation: 2, zIndex: 7 },
  scarf: { zone: 'neck', left: 76, top: 22, width: 19, height: 26, rotation: 3, zIndex: 8 },
  bag: { zone: 'carry', left: 74, top: 48, width: 26, height: 24, rotation: 2, zIndex: 8 },
} as const satisfies Record<'hat' | 'scarf' | 'bag', PlacementShape>;

const MICRO_SHAPES = [
  { zone: 'micro', left: 5, top: 26, width: 12, height: 12, rotation: -2, zIndex: 8 },
  { zone: 'micro', left: 5, top: 42, width: 12, height: 12, rotation: 2, zIndex: 9 },
  { zone: 'micro', left: 5, top: 58, width: 12, height: 12, rotation: -1, zIndex: 10 },
] as const satisfies readonly PlacementShape[];

const IMAGE_SCALE: Record<OutfitCanvasRole, number> = {
  base: 1.62,
  mid: 1.50,
  outer: 1.52,
  dress: 1.50,
  bottom: 1.58,
  shoes: 1.60,
  bag: 1.20,
  hat: 1.12,
  scarf: 1.15,
  accessory: 1.00,
};

const DRESSING_GAP = 3;
const FOOT_GAP = 6;

const includesAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

export function classifyOutfitCanvasRole(item: OutfitCanvasLayoutItem): OutfitCanvasRole {
  if (item.layoutRole && OUTFIT_CANVAS_ROLES.has(item.layoutRole)) return item.layoutRole;

  const value = `${item.category} ${item.name}`.toLowerCase();
  if (includesAny(value, ['外套', '夹克', '大衣', '风衣', '西装', '羽绒', 'outer', 'jacket', 'coat'])) return 'outer';
  if (includesAny(value, ['鞋', '靴', '乐福', 'sneaker', 'shoe', 'loafer', 'boot'])) return 'shoes';
  if (includesAny(value, ['包', '手袋', '背包', 'bag', 'tote'])) return 'bag';
  if (includesAny(value, ['围巾', '丝巾', '领巾', '披肩', '脖套', 'scarf'])) return 'scarf';
  if (includesAny(value, ['帽', 'cap', 'hat', 'beanie'])) return 'hat';
  if (includesAny(value, ['连体', '连衣', 'dress', 'onepiece'])) return 'dress';
  if (includesAny(value, ['下装', '裤', '半裙', '短裙', '长裙', 'bottom', 'trouser', 'pants', 'skirt'])) return 'bottom';
  if (includesAny(value, ['上装', '衬衫', 't恤', '上衣', '针织', '内搭', 'top', 'shirt', 'sweater'])) return 'base';
  return 'accessory';
}

export function garmentImageScale(role: OutfitCanvasRole): number {
  return IMAGE_SCALE[role];
}

function placement(
  item: OutfitCanvasLayoutItem,
  role: OutfitCanvasRole,
  shape: PlacementShape,
): OutfitCanvasPlacement {
  return { item, role, ...shape };
}

function overlaps(a: PlacementShape, b: PlacementShape) {
  return a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top;
}

function mirrorHorizontally(shape: PlacementShape): PlacementShape {
  return {
    ...shape,
    left: 100 - shape.left - shape.width,
    rotation: -shape.rotation,
  };
}

function placePeripheralRole(
  role: 'hat' | 'scarf' | 'bag',
  entries: LayoutEntry[],
  result: OutfitCanvasPlacement[],
) {
  entries.forEach((entry, index) => {
    const primary = ACCESSORY_SHAPES[role];
    const candidate = index % 2 === 0 ? primary : mirrorHorizontally(primary);
    const occupied = result.filter((value) => value.zone !== 'core' && value.zone !== 'foot');
    const shape = occupied.some((value) => overlaps(candidate, value))
      ? mirrorHorizontally(candidate)
      : candidate;
    result.push(placement(entry.item, role, {
      ...shape,
      zIndex: shape.zIndex + index,
    }));
  });
}

function placeMicroEntries(entries: LayoutEntry[], result: OutfitCanvasPlacement[]) {
  entries.forEach((entry, index) => {
    const shape = MICRO_SHAPES[Math.min(index, MICRO_SHAPES.length - 1)];
    result.push(placement(entry.item, 'accessory', {
      ...shape,
      left: shape.left + Math.max(0, index - MICRO_SHAPES.length + 1) * 2,
      zIndex: shape.zIndex + index,
    }));
  });
}

export function placementBounds(placements: OutfitCanvasPlacement[]) {
  const left = Math.min(...placements.map((entry) => entry.left));
  const right = Math.max(...placements.map((entry) => entry.left + entry.width));
  const top = Math.min(...placements.map((entry) => entry.top));
  const bottom = Math.max(...placements.map((entry) => entry.top + entry.height));
  return {
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

export function fitAndCenterPlacements(
  placements: OutfitCanvasPlacement[],
  safeInset = 2,
): OutfitCanvasPlacement[] {
  if (placements.length === 0) return placements;
  const bounds = placementBounds(placements);
  const available = 100 - (safeInset * 2);
  const scale = Math.min(
    1,
    available / (bounds.right - bounds.left),
    available / (bounds.bottom - bounds.top),
  );
  const scaledWidth = (bounds.right - bounds.left) * scale;
  const scaledHeight = (bounds.bottom - bounds.top) * scale;
  const offsetX = 50 - scaledWidth / 2 - bounds.left * scale;
  const offsetY = 50 - scaledHeight / 2 - bounds.top * scale;
  return placements.map((entry) => ({
    ...entry,
    left: entry.left * scale + offsetX,
    top: entry.top * scale + offsetY,
    width: entry.width * scale,
    height: entry.height * scale,
  }));
}

function placeCoreEntries(
  entries: LayoutEntry[],
  shape: PlacementShape,
  result: OutfitCanvasPlacement[],
) {
  entries.forEach((entry, index) => {
    result.push(placement(entry.item, entry.role, {
      ...shape,
      left: shape.left - 4 * index,
      top: shape.top + 2 * index,
      zIndex: shape.zIndex - index,
    }));
  });
}

export function buildOutfitCanvasLayout(items: OutfitCanvasLayoutItem[]): OutfitCanvasPlacement[] {
  if (items.length === 0) return [];

  const entries: LayoutEntry[] = items.map((item) => ({
    item,
    role: classifyOutfitCanvasRole(item),
  }));
  const buckets = new Map<OutfitCanvasRole, LayoutEntry[]>();
  for (const entry of entries) {
    const bucket = buckets.get(entry.role) ?? [];
    bucket.push(entry);
    buckets.set(entry.role, bucket);
  }

  const entriesFor = (role: OutfitCanvasRole) => buckets.get(role) ?? [];
  const outerEntries = entriesFor('outer');
  const dressEntries = entriesFor('dress');
  const baseEntries = entriesFor('base');
  const midEntries = entriesFor('mid');
  const bottomEntries = entriesFor('bottom');
  const shoesEntries = entriesFor('shoes');
  const hasOuter = outerEntries.length > 0;
  const result: OutfitCanvasPlacement[] = [];

  const outerShape: PlacementShape = {
    zone: 'core', left: 4, top: 3, width: 58, height: 70,
    rotation: -2, zIndex: 1,
  };
  const baseShape: PlacementShape = hasOuter
    ? { zone: 'core', left: 38, top: 8, width: 44, height: 31, rotation: 0, zIndex: 5 }
    : { zone: 'core', left: 18, top: 5, width: 50, height: 34, rotation: 0, zIndex: 5 };
  const midShape: PlacementShape = hasOuter
    ? { zone: 'core', left: 31, top: 9, width: 46, height: 30, rotation: -1, zIndex: 4 }
    : { zone: 'core', left: 12, top: 9, width: 50, height: 30, rotation: -1, zIndex: 4 };
  const dressShape: PlacementShape = hasOuter
    ? { zone: 'core', left: 37, top: 5, width: 44, height: 70, rotation: 0, zIndex: 4 }
    : { zone: 'core', left: 20, top: 5, width: 56, height: 70, rotation: 0, zIndex: 4 };

  placeCoreEntries(outerEntries, outerShape, result);

  let dressPlacement: OutfitCanvasPlacement | undefined;
  let basePlacement: OutfitCanvasPlacement | undefined;
  let midPlacement: OutfitCanvasPlacement | undefined;
  let bottomPlacement: OutfitCanvasPlacement | undefined;

  if (dressEntries.length > 0) {
    placeCoreEntries(dressEntries, dressShape, result);
    dressPlacement = result.find((entry) => entry.item === dressEntries[0].item);
  } else if (baseEntries.length > 0) {
    placeCoreEntries(baseEntries, baseShape, result);
    basePlacement = result.find((entry) => entry.item === baseEntries[0].item);
  }

  if (dressEntries.length === 0 && midEntries.length > 0) {
    placeCoreEntries(midEntries, midShape, result);
    midPlacement = result.find((entry) => entry.item === midEntries[0].item);
  }

  if (dressEntries.length === 0 && bottomEntries.length > 0) {
    const upperPlacements = [basePlacement, midPlacement]
      .filter((entry): entry is OutfitCanvasPlacement => Boolean(entry));
    const upperBottom = upperPlacements.length > 0
      ? Math.max(...upperPlacements.map((entry) => entry.top + entry.height))
      : 39;
    const bottomShape: PlacementShape = {
      zone: 'core',
      left: hasOuter ? 38 : 20,
      top: upperBottom + DRESSING_GAP,
      width: hasOuter ? 44 : 46,
      height: 35,
      rotation: 0,
      zIndex: 4,
    };
    placeCoreEntries(bottomEntries, bottomShape, result);
    bottomPlacement = result.find((entry) => entry.item === bottomEntries[0].item);
  }

  if (dressEntries.length > 0) {
    const conflictingSeparates = [...baseEntries, ...midEntries, ...bottomEntries];
    if (conflictingSeparates.length > 0) {
      const currentCoreBottom = Math.max(
        ...result
          .filter((entry) => entry.zone === 'core')
          .map((entry) => entry.top + entry.height),
      );
      const gap = 3;
      const fallbackWidth = Math.max(
        8,
        Math.min(28, (92 - gap * (conflictingSeparates.length - 1)) / conflictingSeparates.length),
      );
      conflictingSeparates.forEach((entry, index) => {
        const fallbackPlacement = placement(entry.item, entry.role, {
          zone: 'core',
          left: 4 + index * (fallbackWidth + gap),
          top: currentCoreBottom + DRESSING_GAP,
          width: fallbackWidth,
          height: 22,
          rotation: entry.role === 'mid' ? -1 : 0,
          zIndex: entry.role === 'base' ? 5 : 4,
        });
        result.push(fallbackPlacement);
        if (entry.role === 'base' && !basePlacement) basePlacement = fallbackPlacement;
        if (entry.role === 'mid' && !midPlacement) midPlacement = fallbackPlacement;
        if (entry.role === 'bottom' && !bottomPlacement) bottomPlacement = fallbackPlacement;
      });
    }
  }

  const corePlacements = result.filter((entry) => entry.zone === 'core');
  const lowestCoreBottom = corePlacements.length > 0
    ? Math.max(...corePlacements.map((entry) => entry.top + entry.height))
    : undefined;
  const footAnchor = bottomPlacement ?? dressPlacement ?? basePlacement ?? midPlacement;
  const shoesShape: PlacementShape = footAnchor
    ? {
        zone: 'foot',
        left: footAnchor.left + footAnchor.width / 2 - 14.5,
        top: (lowestCoreBottom ?? footAnchor.top + footAnchor.height)
          + (dressPlacement ? 7 : FOOT_GAP),
        width: 29,
        height: 18,
        rotation: hasOuter ? 4 : -4,
        zIndex: 9,
      }
    : {
        zone: 'foot', left: 35.5, top: 79, width: 29, height: 18,
        rotation: -4, zIndex: 9,
      };
  shoesEntries.forEach((entry, index) => {
    result.push(placement(entry.item, entry.role, {
      ...shoesShape,
      left: shoesShape.left + 4 * index,
      top: shoesShape.top + 2 * index,
      zIndex: shoesShape.zIndex + index,
    }));
  });

  placePeripheralRole('hat', entriesFor('hat'), result);
  placePeripheralRole('scarf', entriesFor('scarf'), result);
  placePeripheralRole('bag', entriesFor('bag'), result);
  placeMicroEntries(entriesFor('accessory'), result);

  return fitAndCenterPlacements(result);
}
