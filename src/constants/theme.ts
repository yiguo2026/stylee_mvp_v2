import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────
export const Colors = {
  paper: '#FBF8F2',
  paperCard: '#FFFEFA',
  paperRaised: '#FFFFFF',
  vintageCream: '#F5EDE2',
  ink: '#2A1810',
  inkSoft: '#3A2418',
  walnut: '#5A4030',
  walnut2: '#8B6F5A',
  line: '#EFE7D8',
  lineSoft: '#F4EEDF',
  lineStrong: '#E0D3BA',
  terracotta: '#B45A3C',
  sage: '#6B8159',
  linen: '#E8DDC8',
} as const;

export type ColorKey = keyof typeof Colors;
export type ThemeColor = ColorKey;

// ─────────────────────────────────────────────────────────
// Font Families
// Three voices: Soul · Editorial Body · System Scaffold
// ─────────────────────────────────────────────────────────
export const Fonts = Platform.select({
  ios: {
    soul: 'HiraMinProN-W3',
    body: 'STSong',
    ui: 'PingFang SC',
    numeric: 'PlayfairDisplay_400Regular_Italic',
  },
  android: {
    soul: 'serif',
    body: 'serif',
    ui: 'sans-serif',
    numeric: 'PlayfairDisplay_400Regular_Italic',
  },
  web: {
    soul: 'serif',
    body: 'serif',
    ui: 'sans-serif',
    numeric: 'PlayfairDisplay_400Regular_Italic',
  },
  default: {
    soul: 'serif',
    body: 'serif',
    ui: 'sans-serif',
    numeric: 'PlayfairDisplay_400Regular_Italic',
  },
})!;

// ─────────────────────────────────────────────────────────
// Typography tokens (T)
// Each token is a ready-to-spread TextStyle object.
// letterSpacing is in points (em × fontSize).
// ─────────────────────────────────────────────────────────
export const T = {

  // ── 灵魂 Soul Voice · 汇文明朝体 ────────────────
  // Empty-state headings & narrative copy (16–18px, +0.06em)
  emptyTitle: {
    fontFamily: Fonts.soul,
    fontSize: 17,
    letterSpacing: 1.02,   // 17 × 0.06
    lineHeight: 28,
    color: Colors.ink,
  },
  // OOTD / story large titles (24–28px, +0.06em)
  storyTitle: {
    fontFamily: Fonts.soul,
    fontSize: 26,
    letterSpacing: 1.56,   // 26 × 0.06
    lineHeight: 40,
    color: Colors.ink,
  },

  // ── 主体 Editorial Body · STSong (方正悠宋 fallback) ─
  // Page primary titles (24px, +0.02em, weight 600)
  pageTitle: {
    fontFamily: Fonts.body,
    fontSize: 24,
    fontWeight: '600' as const,
    letterSpacing: 0.48,   // 24 × 0.02
    color: Colors.ink,
  },
  // Section / card titles (18–20px, +0.02em, weight 500)
  sectionTitle: {
    fontFamily: Fonts.body,
    fontSize: 18,
    fontWeight: '500' as const,
    letterSpacing: 0.36,   // 18 × 0.02
    color: Colors.ink,
  },
  // Sub-section labels (15–16px)
  subTitle: {
    fontFamily: Fonts.body,
    fontSize: 15,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
    color: Colors.ink,
  },
  // Body text / AI comments / recommendation reasons (14–15px, +0.04em)
  bodyText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    letterSpacing: 0.6,    // 15 × 0.04
    lineHeight: 27,
    color: Colors.walnut,
  },
  // Wardrobe item names / tags (14px, +0.05em)
  itemName: {
    fontFamily: Fonts.body,
    fontSize: 14,
    letterSpacing: 0.7,    // 14 × 0.05
    color: Colors.ink,
  },
  // Secondary item description (13px)
  itemDesc: {
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0.52,
    lineHeight: 22,
    color: Colors.walnut,
  },

  // ── 骨架 System Scaffold · PingFang SC ───────────
  // Primary CTA buttons (16px, +0.06em, weight 600)
  buttonPrimary: {
    fontFamily: Fonts.ui,
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: 0.96,   // 16 × 0.06
  },
  // Secondary buttons / links (14–15px)
  buttonSecondary: {
    fontFamily: Fonts.ui,
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.84,
  },
  // Form input text (16px)
  inputText: {
    fontFamily: Fonts.ui,
    fontSize: 16,
    letterSpacing: 0.32,
  },
  // Form labels / select labels (13px, +0.06em)
  formLabel: {
    fontFamily: Fonts.ui,
    fontSize: 13,
    fontWeight: '500' as const,
    letterSpacing: 0.78,   // 13 × 0.06
    color: Colors.walnut2,
  },
  // Tags / filter chips (12–13px)
  tag: {
    fontFamily: Fonts.ui,
    fontSize: 13,
    letterSpacing: 0.78,
    color: Colors.walnut,
  },
  // Tab bar labels (11px)
  tabLabel: {
    fontFamily: Fonts.ui,
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0.66,
  },
  // Weather / date / environmental metadata (12px, +0.18em, Light)
  caption: {
    fontFamily: Fonts.ui,
    fontSize: 12,
    fontWeight: '300' as const,
    letterSpacing: 2.16,   // 12 × 0.18
    color: Colors.walnut2,
  },
  // Micro metadata / card dates (11px, Light)
  micro: {
    fontFamily: Fonts.ui,
    fontSize: 11,
    fontWeight: '300' as const,
    letterSpacing: 1.65,   // 11 × 0.15
    color: Colors.walnut2,
  },

  // ── Numeric · Playfair Display Italic ───────────
  // Large temperature / hero numbers (24–28px)
  tempLarge: {
    fontFamily: Fonts.numeric,
    fontSize: 26,
    letterSpacing: -0.52,  // -0.02em
    color: Colors.ink,
  },
  // Stats / counts (22px)
  statNum: {
    fontFamily: Fonts.numeric,
    fontSize: 22,
    letterSpacing: -0.44,
    color: Colors.ink,
  },
  // Inline small numbers (14–16px)
  numInline: {
    fontFamily: Fonts.numeric,
    fontSize: 15,
    letterSpacing: -0.3,
    color: Colors.ink,
  },
} as const;

// ─────────────────────────────────────────────────────────
// Spacing
// ─────────────────────────────────────────────────────────
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// ─────────────────────────────────────────────────────────
// Radius
// ─────────────────────────────────────────────────────────
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

// ─────────────────────────────────────────────────────────
// Shadows (warm-toned, not grey)
// ─────────────────────────────────────────────────────────
export const Shadow = {
  one: {
    shadowColor: '#2A1810',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  two: {
    shadowColor: '#2A1810',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  three: {
    shadowColor: '#2A1810',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 6,
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 428;
