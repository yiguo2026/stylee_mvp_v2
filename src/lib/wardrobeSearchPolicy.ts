export interface WardrobeSearchItem {
  name: string;
  category: string;
  color: string;
  brand?: string | null;
  material?: string | null;
}

const SEARCH_ALIASES: Record<string, string[]> = {
  裤子: ['裤', '下装'],
  上衣: ['上装', '衬衫', 'T恤', '卫衣', '针织', '开衫'],
  衣服: ['上装', '外套', '衬衫', 'T恤', '卫衣'],
  裙子: ['裙', '连体装'],
  鞋: ['鞋', '靴', '鞋履'],
  包: ['包', '挎', '背包', '包袋'],
};

const HAT_QUERY = /帽|cap|beanie/i;
const SCARF_QUERY = /围巾|丝巾|领巾|披肩|脖套|scarf/i;
const HAT_ITEM = /帽|cap|beanie/i;
const SCARF_ITEM = /围巾|丝巾|领巾|披肩|脖套|scarf/i;

export function matchesWardrobeSearch(item: WardrobeSearchItem, rawQuery: string): boolean {
  const query = rawQuery.trim();
  if (!query) return true;

  const subtypeText = [item.name, item.brand ?? '', item.material ?? ''].join(' ');
  if (SCARF_QUERY.test(query)) return SCARF_ITEM.test(subtypeText);
  if (query !== '帽巾' && HAT_QUERY.test(query)) {
    return HAT_ITEM.test(subtypeText) && !SCARF_ITEM.test(subtypeText);
  }

  const terms = [query, ...(SEARCH_ALIASES[query] ?? [])];
  const haystack = [
    item.name,
    item.category,
    item.color,
    item.brand ?? '',
    item.material ?? '',
  ].join(' ');
  return terms.some((term) => haystack.includes(term));
}
