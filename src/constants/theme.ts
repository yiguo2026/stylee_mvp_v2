import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────
// Colors — v3.6 Editorial Mark: 冷调中性黑白体系
// ─────────────────────────────────────────────────────────
export const Colors = {
  // 三层中性表面
  paper: '#FFFFFF',         // L1 · App 主背景（纯白）
  paperCard: '#FAFAFA',     // L2 · 卡片层（极浅灰）
  paperRaised: '#F4F4F5',   // L3 · 输入 / 填充块
  // 浮起层（Tab / Modal / Sheet）用纯白 + 阴影，见 Shadows

  // 品牌资产专用（不进 App 界面骨架）
  vintageCream: '#F5EDE2',  // 仅 Logo 底 / App Icon / 品牌物料

  // 墨色
  ink: '#0A0A0A',           // 主墨 — 主文本 / 主按钮 / 激活态
  inkSoft: '#1C1C1E',       // 大字号 display 提亮

  // 中性文本灰阶
  gray1: '#6B6B6E',         // 二级文本
  gray2: '#9A9AA0',         // 三级文本 / 占位

  // 边线
  line: '#ECECEE',          // 主分隔线
  lineSoft: '#F4F4F5',      // 弱分隔线
  lineStrong: '#DEDEE1',    // 卡片描边

  // 低饱和编辑强调色
  accent: '#7F3A34',        // Oxblood — CTA文字 / 收藏 / 关键提醒
  accentSoft: '#F2EDEA',    // Oxblood Wash — 轻提醒背景
  signal: '#555F50',        // Moss Graphite — 风格标签 / 正向标记
  signalSoft: '#EFF1EC',    // Moss Wash — 低强调背景

  // Legacy aliases (for gradual migration)
  walnut: '#6B6B6E',        // = gray1
  walnut2: '#9A9AA0',       // = gray2
  terracotta: '#7F3A34',    // = accent
  sage: '#555F50',          // = signal
  linen: '#ECECEE',         // = line
} as const;

export type ColorKey = keyof typeof Colors;
export type ThemeColor = ColorKey;

// ─────────────────────────────────────────────────────────
// Font Families — v3.6: Playfair Display (英文衬线) + Inter / PingFang SC (中文无衬线)
// 规则：英文标题用 Playfair Display；中文正文/标题一律用 Inter / 苹方等无衬线
// ─────────────────────────────────────────────────────────
export const Fonts = {
  // 英文衬线 — Playfair Display
  display: 'PlayfairDisplay_600SemiBold',      // 英文大标题 / 品牌
  displayItalic: 'PlayfairDisplay_600SemiBold_Italic',
  title: 'PlayfairDisplay_500Medium',          // 英文次级标题
  titleItalic: 'PlayfairDisplay_500Medium_Italic',
  numeric: 'PlayfairDisplay_500Medium',
  numericItalic: 'PlayfairDisplay_400Regular_Italic',
  // 中文 / 无衬线 — Inter + PingFang SC
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  ui: 'Inter_500Medium',
  uiLight: 'Inter_300Light',
  uiSemiBold: 'Inter_600SemiBold',
  // 中文一级标题（字重与 display 对应，但用无衬线）
  cnDisplay: 'Inter_600SemiBold',
  cnTitle: 'Inter_500Medium',
};

// ─────────────────────────────────────────────────────────
// Typography tokens (T)
// ─────────────────────────────────────────────────────────
export const T = {

  // ── Display · Playfair Display 600 — 英文大标题 / 品牌字标 ──
  emptyTitle: {
    fontFamily: Fonts.cnDisplay,
    fontSize: 30,
    letterSpacing: 0,
    lineHeight: 36,
    color: Colors.ink,
  },
  storyTitle: {
    fontFamily: Fonts.display,
    fontSize: 34,
    letterSpacing: 0,
    lineHeight: 40,
    color: Colors.ink,
  },

  // ── Title · 中文用 Inter 500/600；英文用 Playfair Display 500 ──
  pageTitle: {
    fontFamily: Fonts.cnDisplay,
    fontSize: 22,
    letterSpacing: 0,
    lineHeight: 28,
    color: Colors.ink,
  },
  sectionTitle: {
    fontFamily: Fonts.cnTitle,
    fontSize: 18,
    letterSpacing: 0,
    lineHeight: 24,
    color: Colors.ink,
  },
  subTitle: {
    fontFamily: Fonts.cnTitle,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 20,
    color: Colors.ink,
  },

  // ── Body · Inter 400/500 — 列表/描述/说明 ──
  bodyText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    letterSpacing: 0.3,
    lineHeight: 24,
    color: Colors.inkSoft,
  },
  itemName: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    letterSpacing: 0.28,
    color: Colors.ink,
  },
  itemDesc: {
    fontFamily: Fonts.body,
    fontSize: 13,
    letterSpacing: 0.26,
    lineHeight: 22,
    color: Colors.gray1,
  },

  // ── UI · Inter 500/600 — 按钮/标签/用户名/日期 ──
  buttonPrimary: {
    fontFamily: Fonts.uiSemiBold,
    fontSize: 16,
    letterSpacing: 0.32,
  },
  buttonSecondary: {
    fontFamily: Fonts.ui,
    fontSize: 14,
    letterSpacing: 0.28,
  },
  inputText: {
    fontFamily: Fonts.body,
    fontSize: 16,
    letterSpacing: 0.32,
  },
  formLabel: {
    fontFamily: Fonts.ui,
    fontSize: 13,
    letterSpacing: 0.26,
    color: Colors.gray1,
  },
  tag: {
    fontFamily: Fonts.ui,
    fontSize: 13,
    letterSpacing: 0.26,
    color: Colors.ink,
  },
  tabLabel: {
    fontFamily: Fonts.ui,
    fontSize: 11,
    letterSpacing: 0.88,
  },
  caption: {
    fontFamily: Fonts.uiLight,
    fontSize: 12,
    letterSpacing: 0.96,
    color: Colors.gray2,
  },
  micro: {
    fontFamily: Fonts.body,
    fontSize: 11,
    letterSpacing: 0.88,
    color: Colors.gray2,
  },

  // ── Numeric · Playfair Display 正体 — 等宽数字 ──
  tempLarge: {
    fontFamily: Fonts.numeric,
    fontSize: 26,
    letterSpacing: 0,
    color: Colors.ink,
  },
  statNum: {
    fontFamily: Fonts.numeric,
    fontSize: 22,
    letterSpacing: 0,
    color: Colors.ink,
  },
  numInline: {
    fontFamily: Fonts.numeric,
    fontSize: 15,
    letterSpacing: 0,
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
// Shadows — 中性阴影 · 真灰 · 白盒景深
// ─────────────────────────────────────────────────────────
export const Shadow = {
  one: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  two: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  three: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 6,
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 428;
