export type OutfitCanvasRole =
  | 'outer'
  | 'top'
  | 'bottom'
  | 'dress'
  | 'shoes'
  | 'bag'
  | 'hat'
  | 'scarf'
  | 'accessory';

export type OutfitCanvasZone = 'core' | 'orbit' | 'accessory-band';

export interface OutfitCanvasLayoutItem {
  id: string;
  name: string;
  category: string;
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

const includesAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

export function classifyOutfitCanvasRole(item: OutfitCanvasLayoutItem): OutfitCanvasRole {
  const value = `${item.category} ${item.name}`.toLowerCase();
  if (includesAny(value, ['外套', '夹克', '大衣', '风衣', '西装', '羽绒', 'outer', 'jacket', 'coat'])) return 'outer';
  if (includesAny(value, ['鞋', '靴', '乐福', 'sneaker', 'shoe', 'loafer', 'boot'])) return 'shoes';
  if (includesAny(value, ['包', '手袋', '背包', 'bag', 'tote'])) return 'bag';
  if (includesAny(value, ['围巾', '丝巾', '领巾', '披肩', '脖套', 'scarf'])) return 'scarf';
  if (includesAny(value, ['帽', 'cap', 'hat', 'beanie'])) return 'hat';
  if (includesAny(value, ['连体', '连衣', 'dress', 'onepiece'])) return 'dress';
  if (includesAny(value, ['下装', '裤', '半裙', '短裙', '长裙', 'bottom', 'trouser', 'pants', 'skirt'])) return 'bottom';
  if (includesAny(value, ['上装', '衬衫', 't恤', '上衣', '针织', '内搭', 'top', 'shirt', 'sweater'])) return 'top';
  return 'accessory';
}

export function garmentImageScale(role: OutfitCanvasRole): number {
  switch (role) {
    case 'outer': return 1.52;
    case 'top': return 1.62;
    case 'bottom': return 1.58;
    case 'dress': return 1.50;
    case 'shoes': return 1.26;
    case 'bag': return 1.30;
    case 'scarf': return 1.28;
    case 'hat': return 1.25;
    case 'accessory': return 1.20;
  }
}

function placement(
  item: OutfitCanvasLayoutItem,
  role: OutfitCanvasRole,
  shape: PlacementShape,
): OutfitCanvasPlacement {
  return { item, role, ...shape };
}

function orbitShape(role: OutfitCanvasRole, index: number): PlacementShape {
  if (index === 0) {
    if (role === 'bag') return { zone: 'orbit', left: 72, top: 5, width: 26, height: 25, rotation: 3, zIndex: 7 };
    if (role === 'scarf') return { zone: 'orbit', left: 77, top: 4, width: 21, height: 29, rotation: 4, zIndex: 7 };
    if (role === 'accessory') return { zone: 'orbit', left: 79, top: 6, width: 18, height: 16, rotation: 3, zIndex: 7 };
    return { zone: 'orbit', left: 76, top: 3, width: 22, height: 19, rotation: 3, zIndex: 7 };
  }
  if (role === 'bag') return { zone: 'orbit', left: 72, top: 42, width: 26, height: 28, rotation: 3, zIndex: 8 };
  if (role === 'hat') return { zone: 'orbit', left: 77, top: 40, width: 21, height: 19, rotation: -3, zIndex: 8 };
  if (role === 'accessory') return { zone: 'orbit', left: 79, top: 42, width: 18, height: 17, rotation: 4, zIndex: 8 };
  return { zone: 'orbit', left: 77, top: 37, width: 21, height: 33, rotation: 5, zIndex: 8 };
}

export function buildOutfitCanvasLayout(items: OutfitCanvasLayoutItem[]): OutfitCanvasPlacement[] {
  const entries = items.map((item) => ({ item, role: classifyOutfitCanvasRole(item) }));
  const unused = new Set(entries);
  const result: OutfitCanvasPlacement[] = [];

  const take = (role: OutfitCanvasRole) => {
    const entry = entries.find((candidate) => candidate.role === role && unused.has(candidate));
    if (entry) unused.delete(entry);
    return entry;
  };

  const outer = take('outer');
  const dress = take('dress');
  const top = dress ? undefined : take('top');
  const bottom = dress ? undefined : take('bottom');
  const shoes = take('shoes');

  if (outer) {
    result.push(placement(outer.item, outer.role, {
      zone: 'core', left: 4, top: 3, width: 58, height: 70, rotation: -2, zIndex: 1,
    }));
  }

  if (dress) {
    result.push(placement(dress.item, dress.role, outer
      ? { zone: 'core', left: 37, top: 9, width: 44, height: 71, rotation: 0, zIndex: 4 }
      : { zone: 'core', left: 18, top: 4, width: 56, height: 76, rotation: 0, zIndex: 4 }));
  } else {
    if (top) {
      result.push(placement(top.item, top.role, outer
        ? { zone: 'core', left: 38, top: 8, width: 44, height: 31, rotation: 0, zIndex: 5 }
        : { zone: 'core', left: 16, top: 3, width: 52, height: 34, rotation: 0, zIndex: 5 }));
    }
    if (bottom) {
      result.push(placement(bottom.item, bottom.role, outer
        ? { zone: 'core', left: 38, top: 37, width: 44, height: 43, rotation: 0, zIndex: 4 }
        : { zone: 'core', left: 18, top: 34, width: 48, height: 46, rotation: 0, zIndex: 4 }));
    }
  }

  if (shoes) {
    const shoeAnchor = result.find((entry) => entry.role === 'bottom' || entry.role === 'dress')
      ?? result.find((entry) => entry.role === 'top');
    const centeredLeft = shoeAnchor
      ? shoeAnchor.left + (shoeAnchor.width / 2) - 11
      : 39;
    result.push(placement(shoes.item, shoes.role, {
      zone: 'core', left: Math.max(2, Math.min(76, centeredLeft)), top: 82, width: 22, height: 15,
      rotation: outer ? 4 : -4, zIndex: 9,
    }));
  }

  const decorative = entries.filter((entry) => unused.has(entry)
    && ['bag', 'hat', 'scarf', 'accessory'].includes(entry.role));
  decorative.slice(0, 2).forEach((entry, index) => {
    unused.delete(entry);
    result.push(placement(entry.item, entry.role, orbitShape(entry.role, index)));
  });

  const bandEntries = entries.filter((entry) => unused.has(entry));
  if (bandEntries.length > 0) {
    const width = Math.min(14, 60 / bandEntries.length);
    const gap = 2;
    const totalWidth = (width * bandEntries.length) + (gap * Math.max(0, bandEntries.length - 1));
    const start = Math.max(2, (64 - totalWidth) / 2);
    bandEntries.forEach((entry, index) => {
      result.push(placement(entry.item, entry.role, {
        zone: 'accessory-band',
        left: start + index * (width + gap),
        top: 84,
        width,
        height: 14,
        rotation: index % 2 === 0 ? -3 : 3,
        zIndex: 10 + index,
      }));
    });
  }

  return result;
}
