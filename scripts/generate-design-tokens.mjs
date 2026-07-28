#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const sourcePath = resolve(projectRoot, 'design-tokens/stylee-v3.7.tokens.json');
const outputPath = resolve(projectRoot, 'src/design-system/tokens.ts');
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const tokenSetOrder = source.$metadata?.tokenSetOrder ?? [
  'Primitives',
  'Semantic Light',
  'Typography',
  'Components',
];

function getByPath(root, path) {
  return path.split('.').reduce((value, segment) => value?.[segment], root);
}

function findAlias(path) {
  for (const setName of tokenSetOrder) {
    const candidate = getByPath(source[setName], path);
    if (candidate && typeof candidate === 'object' && 'value' in candidate) {
      return { setName, token: candidate };
    }
  }
  throw new Error(`Unknown token alias: {${path}}`);
}

function resolveValue(value, stack = []) {
  if (typeof value === 'string') {
    const match = value.match(/^\{(.+)\}$/);
    if (!match) return value;

    const alias = match[1];
    if (stack.includes(alias)) {
      throw new Error(`Circular token alias: ${[...stack, alias].join(' -> ')}`);
    }
    const { token } = findAlias(alias);
    return resolveValue(token.value, [...stack, alias]);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveValue(entry, stack));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveValue(entry, stack)]),
    );
  }

  return value;
}

function token(setName, path) {
  const definition = getByPath(source[setName], path);
  if (!definition || typeof definition !== 'object' || !('value' in definition)) {
    throw new Error(`Missing token: ${setName}.${path}`);
  }
  return resolveValue(definition.value, [`${setName}.${path}`]);
}

function numberToken(setName, path) {
  const value = Number(token(setName, path));
  if (!Number.isFinite(value)) {
    throw new Error(`Expected numeric token: ${setName}.${path}`);
  }
  return value;
}

function typographyToken(name) {
  const value = token('Typography', `type.${name}`);
  return {
    fontSize: Number(value.fontSize),
    lineHeight: Number(value.lineHeight),
    letterSpacing: Number(value.letterSpacing),
  };
}

function parseShadow(name, elevation) {
  const value = token('Primitives', `shadow.${name}`);
  const colorMatch = String(value.color).match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  );
  if (!colorMatch) {
    throw new Error(`Unsupported shadow color: ${value.color}`);
  }

  const [, red, green, blue, alpha = '1'] = colorMatch;
  const shadowColor = `#${[red, green, blue]
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();

  return {
    shadowColor,
    shadowOffset: {
      width: Number(value.x),
      height: Number(value.y),
    },
    shadowOpacity: Number(alpha),
    shadowRadius: Number(value.blur),
    elevation,
  };
}

const ds = {
  meta: {
    name: 'Stylee Design System',
    version: source.$metadata?.styleeVersion ?? '3.7.0',
  },
  color: {
    primitive: {
      neutral0: token('Primitives', 'color.neutral.0'),
      neutral25: token('Primitives', 'color.neutral.25'),
      neutral50: token('Primitives', 'color.neutral.50'),
      neutral100: token('Primitives', 'color.neutral.100'),
      neutral200: token('Primitives', 'color.neutral.200'),
      neutral500: token('Primitives', 'color.neutral.500'),
      neutral700: token('Primitives', 'color.neutral.700'),
      neutral900: token('Primitives', 'color.neutral.900'),
      neutral950: token('Primitives', 'color.neutral.950'),
      oxblood100: token('Primitives', 'color.oxblood.100'),
      oxblood700: token('Primitives', 'color.oxblood.700'),
      moss100: token('Primitives', 'color.moss.100'),
      moss700: token('Primitives', 'color.moss.700'),
      brandCream: token('Primitives', 'color.brand.cream'),
      brandCocoa: token('Primitives', 'color.brand.cocoa'),
    },
    semantic: {
      surface: {
        base: token('Semantic Light', 'surface.base'),
        card: token('Semantic Light', 'surface.card'),
        input: token('Semantic Light', 'surface.input'),
        floating: token('Semantic Light', 'surface.floating'),
        inverse: token('Semantic Light', 'surface.inverse'),
      },
      text: {
        primary: token('Semantic Light', 'text.primary'),
        secondary: token('Semantic Light', 'text.secondary'),
        tertiary: token('Semantic Light', 'text.tertiary'),
        inverse: token('Semantic Light', 'text.inverse'),
        accent: token('Semantic Light', 'text.accent'),
        positive: token('Semantic Light', 'text.positive'),
      },
      border: {
        subtle: token('Semantic Light', 'border.subtle'),
        default: token('Semantic Light', 'border.default'),
        strong: token('Semantic Light', 'border.strong'),
        focus: token('Semantic Light', 'border.focus'),
      },
      action: {
        primary: token('Semantic Light', 'action.primary'),
        primaryPressed: token('Semantic Light', 'action.primaryPressed'),
        secondary: token('Semantic Light', 'action.secondary'),
        disabled: token('Semantic Light', 'action.disabled'),
        destructive: token('Semantic Light', 'action.destructive'),
      },
      status: {
        positive: token('Semantic Light', 'status.positive'),
        positiveSubtle: token('Semantic Light', 'status.positiveSubtle'),
        attention: token('Semantic Light', 'status.attention'),
        attentionSubtle: token('Semantic Light', 'status.attentionSubtle'),
        neutral: token('Semantic Light', 'status.neutral'),
        neutralSubtle: token('Semantic Light', 'status.neutralSubtle'),
      },
      overlay: {
        scrim: token('Semantic Light', 'overlay.scrim'),
        scrimStrong: token('Semantic Light', 'overlay.scrimStrong'),
      },
    },
  },
  space: {
    0: numberToken('Primitives', 'space.0'),
    0.5: numberToken('Primitives', 'space.0-5'),
    1: numberToken('Primitives', 'space.1'),
    2: numberToken('Primitives', 'space.2'),
    3: numberToken('Primitives', 'space.3'),
    4: numberToken('Primitives', 'space.4'),
    5: numberToken('Primitives', 'space.5'),
    6: numberToken('Primitives', 'space.6'),
    8: numberToken('Primitives', 'space.8'),
    10: numberToken('Primitives', 'space.10'),
    12: numberToken('Primitives', 'space.12'),
    16: numberToken('Primitives', 'space.16'),
  },
  size: {
    control: {
      compact: numberToken('Primitives', 'size.control.compact'),
      small: numberToken('Primitives', 'size.control.small'),
      minimumTouch: numberToken('Primitives', 'size.control.minimumTouch'),
      medium: numberToken('Primitives', 'size.control.medium'),
      large: numberToken('Primitives', 'size.control.large'),
      hero: numberToken('Primitives', 'size.control.hero'),
    },
    icon: {
      xs: numberToken('Primitives', 'size.icon.xs'),
      sm: numberToken('Primitives', 'size.icon.sm'),
      md: numberToken('Primitives', 'size.icon.md'),
      lg: numberToken('Primitives', 'size.icon.lg'),
      xl: numberToken('Primitives', 'size.icon.xl'),
      xxl: numberToken('Primitives', 'size.icon.2xl'),
    },
  },
  radius: {
    xs: numberToken('Primitives', 'radius.xs'),
    sm: numberToken('Primitives', 'radius.sm'),
    md: numberToken('Primitives', 'radius.md'),
    lg: numberToken('Primitives', 'radius.lg'),
    xl: numberToken('Primitives', 'radius.xl'),
    xxl: numberToken('Primitives', 'radius.2xl'),
    xxxl: numberToken('Primitives', 'radius.3xl'),
    full: numberToken('Primitives', 'radius.full'),
  },
  font: {
    family: {
      display: token('Primitives', 'font.family.display'),
      body: token('Primitives', 'font.family.body'),
      cnSerifFallback: token('Primitives', 'font.family.cnSerifFallback'),
      cnSansFallback: token('Primitives', 'font.family.cnSansFallback'),
    },
  },
  typography: {
    displayLarge: typographyToken('displayLarge'),
    display: typographyToken('display'),
    pageTitle: typographyToken('pageTitle'),
    sectionTitle: typographyToken('sectionTitle'),
    body: typographyToken('body'),
    bodySmall: typographyToken('bodySmall'),
    button: typographyToken('button'),
    label: typographyToken('label'),
    caption: typographyToken('caption'),
    micro: typographyToken('micro'),
  },
  motion: {
    duration: {
      instant: token('Primitives', 'motion.duration.instant'),
      fast: token('Primitives', 'motion.duration.fast'),
      normal: token('Primitives', 'motion.duration.normal'),
      slow: token('Primitives', 'motion.duration.slow'),
    },
    easing: {
      standard: token('Primitives', 'motion.easing.standard'),
      enter: token('Primitives', 'motion.easing.enter'),
      exit: token('Primitives', 'motion.easing.exit'),
    },
  },
  layout: {
    screenPaddingCompact: numberToken('Primitives', 'layout.screenPaddingCompact'),
    screenPaddingRegular: numberToken('Primitives', 'layout.screenPaddingRegular'),
    contentMaxMobile: numberToken('Primitives', 'layout.contentMaxMobile'),
    contentMaxReading: numberToken('Primitives', 'layout.contentMaxReading'),
    breakpointTablet: numberToken('Primitives', 'layout.breakpointTablet'),
    gridGap: numberToken('Primitives', 'layout.gridGap'),
    sectionGap: numberToken('Primitives', 'layout.sectionGap'),
  },
  component: {
    button: {
      largeHeight: numberToken('Components', 'button.height.primary'),
      mediumHeight: numberToken('Primitives', 'size.control.medium'),
      smallHeight: numberToken('Components', 'button.height.secondary'),
      radius: numberToken('Components', 'button.radius'),
      horizontalPadding: numberToken('Components', 'button.paddingX'),
    },
    outfitItemCard: {
      columnsMobile: numberToken('Components', 'outfitItemCard.columnsMobile'),
      columnsTablet: numberToken('Components', 'outfitItemCard.columnsTablet'),
      gap: numberToken('Components', 'outfitItemCard.gap'),
      padding: numberToken('Components', 'outfitItemCard.padding'),
      radius: numberToken('Components', 'outfitItemCard.radius'),
      mediaRadius: numberToken('Components', 'outfitItemCard.mediaRadius'),
      mediaAspectRatio: numberToken('Components', 'outfitItemCard.mediaRatio'),
    },
    statusBadge: {
      height: numberToken('Components', 'statusBadge.height'),
      radius: numberToken('Components', 'statusBadge.radius'),
      horizontalPadding: numberToken('Components', 'statusBadge.paddingX'),
      mediaInset: numberToken('Components', 'statusBadge.mediaInset'),
    },
    inlineStatus: {
      minimumHeight: numberToken('Components', 'inlineStatus.minHeight'),
      radius: numberToken('Components', 'inlineStatus.radius'),
      horizontalPadding: numberToken('Components', 'inlineStatus.paddingX'),
      verticalPadding: numberToken('Components', 'inlineStatus.paddingY'),
    },
    stickyDecisionBar: {
      horizontalPadding: numberToken('Components', 'stickyDecisionBar.paddingX'),
      topPadding: numberToken('Components', 'stickyDecisionBar.paddingTop'),
      bottomPadding: numberToken('Components', 'stickyDecisionBar.paddingBottom'),
      actionGap: numberToken('Components', 'stickyDecisionBar.actionGap'),
    },
  },
};

const dsShadow = {
  one: parseShadow('one', 1),
  two: parseShadow('two', 4),
  three: parseShadow('three', 8),
};

const output = `/**
 * AUTO-GENERATED by scripts/generate-design-tokens.mjs.
 * Source: design-tokens/stylee-v3.7.tokens.json
 *
 * Do not edit this file directly. Update the Tokens Studio source and run:
 * npm run tokens:build
 */
export const ds = ${JSON.stringify(ds, null, 2)} as const;

export const dsShadow = ${JSON.stringify(dsShadow, null, 2)} as const;
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(outputPath, 'utf8');
  if (current !== output) {
    console.error('Design tokens are out of sync.');
    console.error('Run `npm run tokens:build` and commit the generated tokens.ts.');
    process.exit(1);
  }
  console.log('Design tokens are in sync.');
} else {
  writeFileSync(outputPath, output);
  console.log(`Generated ${outputPath.replace(`${projectRoot}/`, '')}`);
}
