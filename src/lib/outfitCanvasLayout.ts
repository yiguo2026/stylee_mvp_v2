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
  imageAspectRatio?: number | null;
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
  { zone: 'micro', left: 5, top: 22, width: 12, height: 12, rotation: -2, zIndex: 8 },
  { zone: 'micro', left: 5, top: 38, width: 12, height: 12, rotation: 2, zIndex: 9 },
  { zone: 'micro', left: 5, top: 54, width: 12, height: 12, rotation: -1, zIndex: 10 },
  { zone: 'micro', left: 83, top: 22, width: 12, height: 12, rotation: 2, zIndex: 11 },
  { zone: 'micro', left: 83, top: 38, width: 12, height: 12, rotation: -2, zIndex: 12 },
  { zone: 'micro', left: 83, top: 54, width: 12, height: 12, rotation: 1, zIndex: 13 },
] as const satisfies readonly PlacementShape[];

const IMAGE_SCALE: Record<OutfitCanvasRole, number> = {
  base: 1.62,
  mid: 1.50,
  outer: 1.52,
  dress: 1.50,
  bottom: 1.58,
  shoes: 1.55,
  bag: 1.31,
  hat: 1.12,
  scarf: 1.36,
  accessory: 1.00,
};

const DRESSING_GAP = 3;
const FOOT_GAP = 6;
export const OUTFIT_CANVAS_ASPECT_RATIO = 0.8;
export const OUTFIT_CANVAS_MIN_HEIGHT = 360;

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

export function garmentImageOffsetY(role: OutfitCanvasRole): number {
  return role === 'shoes' ? 10 : 0;
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

function centeredHorizontally(shape: PlacementShape): PlacementShape {
  return {
    ...shape,
    left: (100 - shape.width) / 2,
    rotation: 0,
  };
}

function peripheralCandidates(primary: PlacementShape): PlacementShape[] {
  const secondaryTop = primary.top + primary.height + 4;
  const secondary = { ...primary, top: secondaryTop };
  return [
    primary,
    mirrorHorizontally(primary),
    centeredHorizontally(primary),
    secondary,
    mirrorHorizontally(secondary),
    centeredHorizontally(secondary),
  ];
}

function accessoryPlacements(result: OutfitCanvasPlacement[]) {
  return result.filter((value) => value.zone !== 'core' && value.zone !== 'foot');
}

function* generatedSideBandCandidates(
  primary: PlacementShape,
  predefined: readonly PlacementShape[],
): Generator<PlacementShape> {
  const inset = 4;
  const gap = 4;
  const verticalStep = primary.height + gap;
  const lastTop = 100 - inset - primary.height;
  const topPositions = primary.zone === 'micro'
    ? Array.from(
        { length: Math.floor((lastTop - inset) / verticalStep) + 1 },
        (_, index) => inset + index * verticalStep,
      )
    : [...new Set(predefined.map((candidate) => candidate.top))];

  for (let lane = 0; ; lane += 1) {
    const laneOffset = lane * (primary.width + gap);
    const leftPositions = lane === 0
      ? [inset, 100 - inset - primary.width]
      : [inset - laneOffset, 100 - inset - primary.width + laneOffset];
    for (const left of leftPositions) {
      for (const top of topPositions) {
        yield {
          ...primary,
          left,
          top,
          rotation: left < 50 ? -Math.abs(primary.rotation) : Math.abs(primary.rotation),
        };
      }
    }
  }
}

function firstUnoccupiedAccessoryShape(
  predefined: readonly PlacementShape[],
  primary: PlacementShape,
  result: OutfitCanvasPlacement[],
) {
  const occupied = accessoryPlacements(result);
  for (const candidate of predefined) {
    if (!occupied.some((value) => overlaps(candidate, value))) return candidate;
  }
  for (const candidate of generatedSideBandCandidates(primary, predefined)) {
    if (!occupied.some((value) => overlaps(candidate, value))) return candidate;
  }
  throw new Error('unreachable accessory placement exhaustion');
}

function placePeripheralRole(
  role: 'hat' | 'scarf' | 'bag',
  entries: LayoutEntry[],
  result: OutfitCanvasPlacement[],
) {
  const candidates = peripheralCandidates(ACCESSORY_SHAPES[role]);
  entries.forEach((entry, index) => {
    const shape = firstUnoccupiedAccessoryShape(candidates, ACCESSORY_SHAPES[role], result);
    result.push(placement(entry.item, role, {
      ...shape,
      zIndex: shape.zIndex + index,
    }));
  });
}

function placeMicroEntries(entries: LayoutEntry[], result: OutfitCanvasPlacement[]) {
  entries.forEach((entry, index) => {
    const shape = firstUnoccupiedAccessoryShape(MICRO_SHAPES, MICRO_SHAPES[0], result);
    result.push(placement(entry.item, 'accessory', {
      ...shape,
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

function renderedRect(entry: OutfitCanvasPlacement) {
  const frameLeft = entry.left;
  const frameTop = entry.top / OUTFIT_CANVAS_ASPECT_RATIO;
  const frameWidth = entry.width;
  const frameHeight = entry.height / OUTFIT_CANVAS_ASPECT_RATIO;
  const frameCenterX = frameLeft + frameWidth / 2;
  const frameCenterY = frameTop + frameHeight / 2;
  const hasImage = Boolean(entry.item.imageUri || entry.item.imageSource);
  const sourceAspectRatio = typeof entry.item.imageAspectRatio === 'number'
    && Number.isFinite(entry.item.imageAspectRatio)
    && entry.item.imageAspectRatio > 0
    ? entry.item.imageAspectRatio
    : 1;

  let renderedWidth = frameWidth;
  let renderedHeight = frameHeight;
  let imageOffsetY = 0;
  if (hasImage) {
    if (frameWidth > 0 && frameHeight > 0) {
      const frameAspectRatio = frameWidth / frameHeight;
      const containedWidth = sourceAspectRatio > frameAspectRatio
        ? frameWidth
        : frameHeight * sourceAspectRatio;
      const containedHeight = sourceAspectRatio > frameAspectRatio
        ? frameWidth / sourceAspectRatio
        : frameHeight;
      renderedWidth = containedWidth * garmentImageScale(entry.role);
      renderedHeight = containedHeight * garmentImageScale(entry.role);
    } else {
      renderedWidth = 0;
      renderedHeight = 0;
    }
    imageOffsetY = (
      garmentImageOffsetY(entry.role) / OUTFIT_CANVAS_MIN_HEIGHT * 100
    ) / OUTFIT_CANVAS_ASPECT_RATIO;
  }

  const imageCenterX = frameCenterX;
  const imageCenterY = frameCenterY + imageOffsetY;
  const radians = entry.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [-renderedWidth / 2, -renderedHeight / 2],
    [renderedWidth / 2, -renderedHeight / 2],
    [renderedWidth / 2, renderedHeight / 2],
    [-renderedWidth / 2, renderedHeight / 2],
  ].map(([offsetX, offsetY]) => {
    const x = imageCenterX + offsetX;
    const y = imageCenterY + offsetY;
    const relativeX = x - frameCenterX;
    const relativeY = y - frameCenterY;
    return {
      x: frameCenterX + relativeX * cosine - relativeY * sine,
      y: frameCenterY + relativeX * sine + relativeY * cosine,
    };
  });

  return {
    left: Math.min(...corners.map((corner) => corner.x)),
    right: Math.max(...corners.map((corner) => corner.x)),
    top: Math.min(...corners.map((corner) => corner.y)) * OUTFIT_CANVAS_ASPECT_RATIO,
    bottom: Math.max(...corners.map((corner) => corner.y)) * OUTFIT_CANVAS_ASPECT_RATIO,
  };
}

function renderedPlacementBounds(placements: OutfitCanvasPlacement[]) {
  const rectangles = placements.map(renderedRect);
  const left = Math.min(...rectangles.map((entry) => entry.left));
  const right = Math.max(...rectangles.map((entry) => entry.right));
  const top = Math.min(...rectangles.map((entry) => entry.top));
  const bottom = Math.max(...rectangles.map((entry) => entry.bottom));
  return {
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function scalePlacementFrames(
  placements: OutfitCanvasPlacement[],
  scale: number,
): OutfitCanvasPlacement[] {
  return placements.map((entry) => ({
    ...entry,
    left: entry.left * scale,
    top: entry.top * scale,
    width: entry.width * scale,
    height: entry.height * scale,
  }));
}

export function fitAndCenterPlacements(
  placements: OutfitCanvasPlacement[],
  safeInset = 2,
): OutfitCanvasPlacement[] {
  if (placements.length === 0) return placements;
  const available = 100 - (safeInset * 2);
  const fits = (scale: number) => {
    const bounds = renderedPlacementBounds(scalePlacementFrames(placements, scale));
    return bounds.right - bounds.left <= available
      && bounds.bottom - bounds.top <= available;
  };

  let scale = 1;
  if (!fits(scale)) {
    let lower = 0;
    let upper = 1;
    for (let iteration = 0; iteration < 64; iteration += 1) {
      const candidate = (lower + upper) / 2;
      if (fits(candidate)) lower = candidate;
      else upper = candidate;
    }
    scale = lower;
  }

  const scaled = scalePlacementFrames(placements, scale);
  const bounds = renderedPlacementBounds(scaled);
  const offsetX = 50 - bounds.centerX;
  const offsetY = 50 - bounds.centerY;
  return scaled.map((entry) => ({
    ...entry,
    left: entry.left + offsetX,
    top: entry.top + offsetY,
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
  const conflictingSeparates = [...baseEntries, ...midEntries, ...bottomEntries];
  const usesDressFallbackRow = dressEntries.length > 0 && conflictingSeparates.length > 0;
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

  if (dressEntries.length > 0 && !usesDressFallbackRow) {
    placeCoreEntries(dressEntries, dressShape, result);
    dressPlacement = result.find((entry) => entry.item === dressEntries[0].item);
  } else if (dressEntries.length === 0 && baseEntries.length > 0) {
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

  if (usesDressFallbackRow) {
    const fallbackEntries = [...dressEntries, ...conflictingSeparates];
    const existingCore = result.filter((entry) => entry.zone === 'core');
    const fallbackTop = existingCore.length > 0
      ? Math.max(...existingCore.map((entry) => entry.top + entry.height)) + DRESSING_GAP
      : 5;
    const gap = 3;
    const fallbackWidth = Math.max(
      8,
      Math.min(28, (92 - gap * (fallbackEntries.length - 1)) / fallbackEntries.length),
    );
    fallbackEntries.forEach((entry, index) => {
      const fallbackPlacement = placement(entry.item, entry.role, {
        zone: 'core',
        left: 4 + index * (fallbackWidth + gap),
        top: fallbackTop,
        width: fallbackWidth,
        height: 22,
        rotation: entry.role === 'mid' ? -1 : 0,
        zIndex: entry.role === 'base' ? 5 : 4,
      });
      result.push(fallbackPlacement);
      if (entry.role === 'dress' && !dressPlacement) dressPlacement = fallbackPlacement;
      if (entry.role === 'base' && !basePlacement) basePlacement = fallbackPlacement;
      if (entry.role === 'mid' && !midPlacement) midPlacement = fallbackPlacement;
      if (entry.role === 'bottom' && !bottomPlacement) bottomPlacement = fallbackPlacement;
    });
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
