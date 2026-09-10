import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath, URL as NodeURL } from 'node:url';

import { auditRecommendationPreferenceCall } from './test-fixtures/stylePreferences/recommendationSourceAudit.ts';

const source = async (relativePath: string) => readFile(
  fileURLToPath(new NodeURL(relativePath, import.meta.url)),
  'utf8',
);

test('preference feature contains no direct taxonomy or preference DML', async () => {
  const feature = (await Promise.all([
    source('../app/onboarding/step2-style.tsx'),
    source('../app/profile/style.tsx'),
    source('../components/StylePreferenceScreen.tsx'),
  ])).join('\n');

  assert.doesNotMatch(feature, /\.from\(['"]tags['"]\)\s*\.upsert|tags\.upsert/u);
  assert.doesNotMatch(feature, /user_style_preferences|\.delete\(\)|\.upsert\(/u);
  assert.doesNotMatch(feature, /for\s*\([^)]*(?:pref|tag)[^)]*\)\s*\{[^}]*upsert/su);
  assert.doesNotMatch(feature, /@\/lib\/supabase/u);
});

test('userStore has only the scoped profile read and no preference state source', async () => {
  const userStore = await source('../stores/userStore.ts');

  assert.doesNotMatch(userStore, /user_style_preferences|tags\(\*\)/u);
  assert.doesNotMatch(userStore, /\bstylePreferences\b|\bsetStylePreferences\b/u);
  assert.match(userStore, /from\(['"]users['"]\)\.select\(['"]\*['"]\)/u);
});

test('both route shells use the one shared screen and retained production controller', async () => {
  for (const path of ['../app/onboarding/step2-style.tsx', '../app/profile/style.tsx']) {
    const route = await source(path);
    assert.match(route, /StylePreferenceScreen/u);
    assert.match(route, /webStylePreferenceController/u);
    assert.match(route, /webAccountScope/u);
    assert.doesNotMatch(route, /useState|createStylePreferenceController|\.save\(|\.skip\(|\.toggle\(/u);
  }
});

test('profile summary and recommendation never consume legacy labels or draft preference state', async () => {
  const profile = await source('../app/(tabs)/profile.tsx');
  const result = await source('../app/outfit/result.tsx');

  assert.doesNotMatch(profile, /STYLE_TAGS|PRESET_STYLE_PREFERENCES|tag\?\.tag_name|stylePreferences/u);
  assert.doesNotMatch(result, /tag\?\.tag_name|PRESET_STYLE_PREFERENCES|STYLE_TAGS/u);
  assert.doesNotMatch(result, /getState\(\)\.stylePreferences/u);
});

test('recommendation adds confirmed model values for the current account without dropping existing inputs', async () => {
  const result = await source('../app/outfit/result.tsx');

  assert.deepEqual(auditRecommendationPreferenceCall(result), []);
});

test('recommendation AST guard rejects account-derived and detached preference context', () => {
  const valid = `
    aiRecommendOutfits(items, userId, sessionId, withConfirmedStylePreferenceContext({
      weather: params.weather, temp: params.temp, city: params.city,
      query: params.query, tags: params.tags,
    }, webStylePreferenceController.getSnapshot(), userId));
  `;
  assert.deepEqual(auditRecommendationPreferenceCall(valid), []);

  const wrongOwner = valid.replace(
    'webStylePreferenceController.getSnapshot(), userId',
    'webStylePreferenceController.getSnapshot(), snapshot.server?.accountId',
  );
  assert.ok(auditRecommendationPreferenceCall(wrongOwner).includes('current_user_required'));

  const detached = `
    const context = withConfirmedStylePreferenceContext({
      weather: params.weather, temp: params.temp, city: params.city,
      query: params.query, tags: params.tags,
    }, webStylePreferenceController.getSnapshot(), userId);
    aiRecommendOutfits(items, userId, sessionId, { ...context });
  `;
  assert.ok(auditRecommendationPreferenceCall(detached).includes('direct_context_required'));
});

test('the product preference gate is executable and runs before account-scope gates', async () => {
  const packageJson = JSON.parse(await source('../../package.json'));
  const scripts = packageJson.scripts as Record<string, string>;

  assert.match(scripts['test:style-preference-product'], /stylePreferenceSelectors\.test\.ts/u);
  assert.match(scripts['test:style-preference-product'], /stylePreferenceViewModel\.test\.ts/u);
  assert.match(scripts['test:style-preference-product'], /stylePreferenceRoutes\.integration\.test\.mjs/u);
  assert.match(scripts['test:style-preference-product'], /stylePreferenceSourceBoundary\.test\.ts/u);
  assert.ok(scripts['check:consumer'].indexOf('test:style-preference-product')
    < scripts['check:consumer'].indexOf('test:account-scope'));
});
