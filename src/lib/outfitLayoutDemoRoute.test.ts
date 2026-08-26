import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = dirname(fileURLToPath(import.meta.url));

test('demo uses fixed response fixtures and labels stress cases honestly', () => {
  const source = readFileSync(resolve(libDir, '../app/outfit-layout-demo.tsx'), 'utf8');
  const fixtures = readFileSync(resolve(libDir, '../data/outfitLayoutDemoFixtures.ts'), 'utf8');
  assert.match(source, /outfitLayoutDemoFixtures/);
  assert.match(fixtures, /合法响应 fixture/);
  assert.match(fixtures, /8件结构压力测试/);
  assert.doesNotMatch(fixtures, /8件合法上限/);
  assert.doesNotMatch(source, /aiRecommend|tryon|fetch\(|supabase/);
});

test('settings contains a discoverable demo entry', () => {
  const settings = readFileSync(resolve(libDir, '../app/profile/settings.tsx'), 'utf8');
  assert.match(settings, /搭配画布 Demo/);
  assert.match(settings, /router\.push\('\/outfit-layout-demo'\)/);
});

test('the shareable demo route is not redirected to login', () => {
  const rootLayout = readFileSync(resolve(libDir, '../app/_layout.tsx'), 'utf8');
  assert.match(rootLayout, /pathname\.startsWith\('\/outfit-layout-demo'\)/);
  assert.match(rootLayout, /if \(!isPublicPreview\) router\.replace\('\/\(auth\)\/login'\)/);
});
