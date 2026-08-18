import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = dirname(fileURLToPath(import.meta.url));

test('online demo exposes 3, 4, and 6 item states through the production canvas', () => {
  const source = readFileSync(resolve(libDir, '../app/outfit-layout-demo.tsx'), 'utf8');
  assert.match(source, /StyleeOutfitCanvas/);
  assert.match(source, /3件基础/);
  assert.match(source, /4件叠穿/);
  assert.match(source, /6件配饰/);
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
