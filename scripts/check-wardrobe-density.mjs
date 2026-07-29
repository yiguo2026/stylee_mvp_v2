#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const tokenPath = resolve(projectRoot, 'design-tokens/stylee-v3.8.tokens.json');
const tokens = JSON.parse(readFileSync(tokenPath, 'utf8'));
const tokenSetOrder = tokens.$metadata?.tokenSetOrder ?? [];

function getByPath(root, path) {
  return path.split('.').reduce((value, segment) => value?.[segment], root);
}

function findDefinition(path) {
  for (const setName of tokenSetOrder) {
    const definition = getByPath(tokens[setName], path);
    if (definition && typeof definition === 'object' && 'value' in definition) {
      return definition;
    }
  }
  throw new Error(`Unknown token alias: {${path}}`);
}

function resolveValue(value) {
  if (typeof value === 'string') {
    const alias = value.match(/^\{(.+)\}$/);
    return alias ? resolveValue(findDefinition(alias[1]).value) : value;
  }
  return value;
}

function number(path) {
  const definition = getByPath(tokens.Components, path);
  if (!definition) throw new Error(`Missing component token: ${path}`);
  const value = Number(resolveValue(definition.value));
  if (!Number.isFinite(value)) throw new Error(`Expected numeric token: ${path}`);
  return value;
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

const viewportWidth = number('wardrobeGrid.referenceViewportWidth');
const columns = number('wardrobeGrid.columnsMobile');
const screenPadding = number('wardrobeGrid.screenPadding');
const columnGap = number('wardrobeGrid.columnGap');
const rowGap = number('wardrobeGrid.rowGap');
const visibleRows = number('wardrobeGrid.visibleRowsReference');
const mediaRatio = number('wardrobeCard.mediaRatio');
const infoHeight = number('wardrobeCard.infoMinHeight');
const headerHeight = number('pageHeader.minHeight');
const searchHeight = number('searchField.height');
const chipHeight = number('choiceChip.visualMinHeight');
const controlsGap = number('wardrobeGrid.controlsGap');
const minimumTouch = number('choiceChip.minimumTouch');

assertEqual('reference viewport width', viewportWidth, 393);
assertEqual('mobile columns', columns, 2);
assertEqual('visible reference rows', visibleRows, 3);
assertEqual('screen padding', screenPadding, 16);
assertEqual('column gap', columnGap, 8);
assertEqual('row gap', rowGap, 8);
assertEqual('header height', headerHeight, 44);
assertEqual('search height', searchHeight, 44);
assertEqual('choice-chip height', chipHeight, 32);
assertEqual('minimum touch target', minimumTouch, 44);
assertEqual('wardrobe card information height', infoHeight, 48);

const cardWidth = (
  viewportWidth
  - screenPadding * 2
  - columnGap * (columns - 1)
) / columns;
const cardHeight = cardWidth / mediaRatio + infoHeight;
const gridHeight = cardHeight * visibleRows + rowGap * (visibleRows - 1);
const controlsHeight = headerHeight + searchHeight + chipHeight + controlsGap * 3;
const stableContentHeight = gridHeight + controlsHeight;

if (stableContentHeight > 702) {
  throw new Error(
    `Wardrobe reference composition exceeds 702 pt: ${stableContentHeight.toFixed(2)} pt`,
  );
}

const wardrobeScreen = readFileSync(
  resolve(projectRoot, 'src/app/(tabs)/wardrobe.tsx'),
  'utf8',
);
const wardrobeCard = readFileSync(
  resolve(projectRoot, 'src/design-system/StyleeWardrobeCard.tsx'),
  'utf8',
);
const importSkeleton = readFileSync(
  resolve(projectRoot, 'src/components/ImportSkeletonCard.tsx'),
  'utf8',
);

for (const requiredComponent of [
  'StyleePageHeader',
  'StyleeSearchField',
  'StyleeWardrobeCard',
  'StyleeWardrobeGrid',
]) {
  if (!wardrobeScreen.includes(requiredComponent)) {
    throw new Error(`Wardrobe screen must use ${requiredComponent}.`);
  }
}

for (const forbiddenPattern of [
  ['floating add button', /styles\.fab|\bfab:\s*\{/],
  ['page-local card aspect ratio', /\baspectRatio\s*:/],
  ['cover-fit garment image', /resizeMode=["']cover["']/],
]) {
  if (forbiddenPattern[1].test(wardrobeScreen)) {
    throw new Error(`Wardrobe screen reintroduced ${forbiddenPattern[0]}.`);
  }
}

if (!/resizeMode=["']contain["']/.test(wardrobeCard)) {
  throw new Error('StyleeWardrobeCard must render garment images with contain.');
}

if (!importSkeleton.includes('ds.component.wardrobeCard.mediaAspectRatio')) {
  throw new Error('ImportSkeletonCard must share wardrobe-card media geometry.');
}

console.log(
  `Wardrobe density contract passed: ${cardWidth.toFixed(1)} pt cards, `
  + `${stableContentHeight.toFixed(1)} pt stable composition.`,
);
