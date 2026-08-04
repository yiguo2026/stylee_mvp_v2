/**
 * Stylee MVP —— 场合 × 风格「软引导互斥」配置
 *
 * 只在【生成穿搭 filter】下起作用；不做单品打标、不做衣橱筛选。
 *
 * 设计原则：
 *  1. 软引导，不硬互斥：不兼容的 tag 只做视觉降饱和，仍可点击。
 *  2. 多选并集：多个场合/风格同时选中时，兼容池取并集（宽松策略）。
 *  3. 只面向「occasion / style」两类 tag；色系/温度不参与。
 *  4. 禁品类/禁材质本次不做（属于 9.2 约束层，跳过）。
 *
 * PM 提供的 S01-S08 场景 × 风格池，已经映射到项目现有的英文 tag id 上，
 * 保持现有 tag 命名不变，避免破坏其它模块的引用。
 */

// ─── ID 类型（对齐 src/types/index.ts OCCASION_TAGS / STYLE_TAGS 的 id） ───

export type OccasionId =
  | 'daily_commute'
  | 'date'
  | 'travel'
  | 'business'
  | 'sport'
  | 'ceremony'
  | 'beach'
  | 'hiking'
  | 'home'
  | 'party';

export type StyleId =
  | 'quiet_luxury'
  | 'minimalist'
  | 'commute_style'
  | 'french'
  | 'preppy'
  | 'safari'
  | 'vintage'
  | 'street'
  | 'sporty_casual'
  | 'rock'
  | 'goth'
  | 'sweet'
  | 'romantic'
  | 'bohemian'
  | 'western'
  | 'utility'
  | 'wabi_sabi'
  | 'avantgarde'
  | 'urban_cool';

// ─── S01-S08：场合 → 允许风格池（PM 拍板） ────────────────────────────
//
// PM 原表 → 现有 tag id 的对应（保持现有命名，语义上是同义词）：
//   通勤职场   -> commute_style
//   静奢老钱   -> quiet_luxury
//   极简       -> minimalist
//   都市酷感   -> urban_cool
//   法式慵懒   -> french
//   甜美少女   -> sweet
//   浪漫田园   -> romantic
//   日系侘寂   -> wabi_sabi
//   先锋设计师 -> avantgarde
//   运动机能   -> sporty_casual
//   工装实用   -> utility
//   街头潮流   -> street
//   学院       -> preppy
//   复古       -> vintage
//   波西米亚   -> bohemian
//   摇滚机车   -> rock
//   哥特暗黑   -> goth
//
// 现有 tag 中「西部牛仔 western / 猎装 safari」PM 表里没出现，暂不纳入任何池；
// 也就是说无论选什么场合，它们都会被视为"不兼容"（软降饱和），符合最小侵入原则。

export const OCCASION_STYLE_POOL: Record<OccasionId, StyleId[]> = {
  // S01 职场通勤：现有「日常通勤」
  daily_commute: ['commute_style', 'quiet_luxury', 'minimalist', 'urban_cool'],
  // S02 约会社交：现有「逛街约会」
  date: [
    'french', 'sweet', 'urban_cool', 'romantic',
    'wabi_sabi', 'avantgarde', 'quiet_luxury',
  ],
  // S07 旅行度假：现有「旅途出游」
  travel: ['bohemian', 'romantic', 'french', 'sporty_casual', 'utility', 'street'],
  // 职场商务 ≈ PM S01 职场通勤 + S06 面试（更偏正式的职场）
  business: ['commute_style', 'quiet_luxury', 'minimalist', 'urban_cool'],
  // S03 运动户外：现有「运动健身」
  sport: ['sporty_casual', 'utility', 'street'],
  // S05 正式晚宴：现有「正式典礼」
  ceremony: ['quiet_luxury', 'minimalist', 'commute_style', 'french', 'avantgarde'],
  // S07 旅行度假：现有「度假沙滩」（度假语义偏向 S07）
  beach: ['bohemian', 'romantic', 'french', 'sporty_casual', 'utility', 'street'],
  // S03 运动户外：现有「户外徒步」
  hiking: ['sporty_casual', 'utility', 'street'],
  // S04 休闲日常：现有「休闲居家」
  home: [
    'preppy', 'street', 'wabi_sabi', 'urban_cool',
    'vintage', 'french', 'minimalist', 'romantic', 'bohemian',
  ],
  // S08 派对夜店：现有「派对娱乐」
  party: ['rock', 'goth', 'street', 'avantgarde', 'urban_cool', 'quiet_luxury'],
};

// ─── 反算：风格 → 兼容场合池（静态生成，无运行时开销） ────────────

export const STYLE_OCCASION_POOL: Record<StyleId, OccasionId[]> = (() => {
  const map: Partial<Record<StyleId, OccasionId[]>> = {};
  (Object.keys(OCCASION_STYLE_POOL) as OccasionId[]).forEach((occ) => {
    OCCASION_STYLE_POOL[occ].forEach((sty) => {
      if (!map[sty]) map[sty] = [];
      map[sty]!.push(occ);
    });
  });
  // 兜底：没被任何 occasion 覆盖的 style（western / safari）返回空数组，
  // 表示对任意已选 occasion 都不兼容（软提示，不阻断）。
  const allStyles: StyleId[] = [
    'quiet_luxury', 'minimalist', 'commute_style', 'french', 'preppy',
    'safari', 'vintage', 'street', 'sporty_casual', 'rock', 'goth',
    'sweet', 'romantic', 'bohemian', 'western', 'utility', 'wabi_sabi',
    'avantgarde', 'urban_cool',
  ];
  allStyles.forEach((s) => {
    if (!map[s]) map[s] = [];
  });
  return map as Record<StyleId, OccasionId[]>;
})();

// ─── 兼容判定（并集策略） ────────────────────────────────────────

/**
 * 判断某个 style 在当前已选 occasions 下是否兼容（并集）。
 * - 未选任何 occasion：一律兼容（默认状态）
 * - 至少一个已选 occasion 覆盖了此 style：兼容
 */
export function isStyleCompatible(
  style: string,
  selectedOccasions: string[],
): boolean {
  if (selectedOccasions.length === 0) return true;
  return selectedOccasions.some(
    (o) => OCCASION_STYLE_POOL[o as OccasionId]?.includes(style as StyleId),
  );
}

/**
 * 判断某个 occasion 在当前已选 styles 下是否兼容（并集）。
 * - 未选任何 style：一律兼容
 * - 至少一个已选 style 覆盖了此 occasion：兼容
 */
export function isOccasionCompatible(
  occasion: string,
  selectedStyles: string[],
): boolean {
  if (selectedStyles.length === 0) return true;
  return selectedStyles.some(
    (s) => STYLE_OCCASION_POOL[s as StyleId]?.includes(occasion as OccasionId),
  );
}

// ─── Toast / Confirm 文案 ────────────────────────────────────────

/**
 * 生成"不太协调"的 confirm 文案。
 *
 * @param tagLabel    当前被点的 tag 中文 label（如「街头潮流」）
 * @param tagKind     被点的 tag 是 style 还是 occasion
 * @param selectedOtherLabels  已选的另一维度 label 数组（用中文展示）
 */
export function buildConflictMessage(
  tagLabel: string,
  tagKind: 'style' | 'occasion',
  selectedOtherLabels: string[],
): string {
  const kindLabel = tagKind === 'style' ? '场合' : '风格';
  const others = selectedOtherLabels.slice(0, 3).join('、');
  const suffix = selectedOtherLabels.length > 3 ? '…' : '';
  return `「${tagLabel}」和已选${kindLabel}「${others}${suffix}」搭配可能不太协调，仍要使用吗？`;
}
