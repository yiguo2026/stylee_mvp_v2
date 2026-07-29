import { Platform } from 'react-native';
import { ds } from '@/design-system/tokens';

// ─────────────────────────────────────────────────────────
// Colors — v3.8 compatibility aliases.
// New reusable components consume `src/design-system/tokens.ts` directly.
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
  // 页面主标题 · 英文 Playfair Display + 中文宋体衬线回退（对齐 v3.6 · 01 Display）
  pageTitleSerif: (Platform.select({
    web: '"PlayfairDisplay_600SemiBold", "Source Han Serif SC", "Noto Serif SC", "Songti SC", "STSong", STZhongsong, SimSun, serif',
    default: 'PlayfairDisplay_600SemiBold',
  }) ?? 'PlayfairDisplay_600SemiBold') as string,
  // 02 Title · Playfair Display 500 + 中文宋体衬线回退
  titleSerif: (Platform.select({
    web: '"PlayfairDisplay_500Medium", "Source Han Serif SC", "Noto Serif SC", "Songti SC", "STSong", STZhongsong, SimSun, serif',
    default: 'PlayfairDisplay_500Medium',
  }) ?? 'PlayfairDisplay_500Medium') as string,
  // 04 Numeric · Playfair Display 500 · 与 titleSerif 相同族，等宽正体
  numericSerif: (Platform.select({
    web: '"PlayfairDisplay_500Medium", "Source Han Serif SC", "Noto Serif SC", "Songti SC", "STSong", STZhongsong, SimSun, serif',
    default: 'PlayfairDisplay_500Medium',
  }) ?? 'PlayfairDisplay_500Medium') as string,
};

// ─────────────────────────────────────────────────────────
// Typography — four semantic levels only.
// Color and alignment may change with context; family, size, line height,
// weight, and tracking must come from one of these four roles.
// ─────────────────────────────────────────────────────────
export const TypeRole = {
  display: {
    ...ds.typography.display,
    fontFamily: Fonts.pageTitleSerif,
    color: Colors.ink,
  },
  heading: {
    ...ds.typography.heading,
    fontFamily: Fonts.titleSerif,
    color: Colors.ink,
  },
  content: {
    ...ds.typography.content,
    fontFamily: Fonts.ui,
    color: Colors.ink,
  },
  support: {
    ...ds.typography.support,
    fontFamily: Fonts.body,
    color: Colors.gray1,
  },
} as const;

// Compatibility aliases keep existing screens on the four-level system while
// they migrate to the canonical role names.
export const T = {
  display: TypeRole.display,
  heading: TypeRole.heading,
  content: TypeRole.content,
  support: TypeRole.support,

  emptyTitle: TypeRole.display,
  storyTitle: TypeRole.display,
  pageTitle: TypeRole.display,

  sectionTitle: TypeRole.heading,
  subTitle: TypeRole.heading,

  bodyText: TypeRole.content,
  itemName: TypeRole.content,
  buttonPrimary: TypeRole.content,
  buttonSecondary: TypeRole.content,
  inputText: TypeRole.content,
  tag: TypeRole.content,

  itemDesc: TypeRole.support,
  formLabel: TypeRole.support,
  tabLabel: TypeRole.support,
  caption: { ...TypeRole.support, color: Colors.gray2 },
  micro: { ...TypeRole.support, color: Colors.gray2 },

  tempLarge: TypeRole.display,
  statNum: TypeRole.heading,
  numInline: TypeRole.content,
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
