import { test } from 'node:test';
import assert from 'node:assert';
import type { WardrobeItem } from '@/types';
import { recognizeRespToResult, toRecommendRequest, outfitsRespToApp } from './styleeMapping.ts';

const item = (o: Partial<WardrobeItem>): WardrobeItem => ({
  item_id: 'x', user_id: 'u', name: '', category: '上装', color: '白',
  source_type: 'manual', status: 'active', created_at: '', updated_at: '', ...o,
} as WardrobeItem);

test('recognizeRespToResult 映射并带出 photo_type/needs_review', () => {
  const r = recognizeRespToResult({
    category: '上装', color: '白色', material: '棉', style: '简约', brand: '',
    photo_type: 'on_body', needs_review: false, confidence: 0.95,
  });
  assert.equal(r.category, '上装');
  assert.equal(r.color, '白色');
  assert.equal(r.photo_type, 'on_body');
  assert.equal(r.needs_review, false);
});

test('toRecommendRequest 映射 fit_type→fit、拆 style_prefs、temp→temp_c', () => {
  const req = toRecommendRequest(
    [item({ item_id: 't1', category: '上装', fit_type: '修身', color: '白', material: '棉', season: ['春'], occasion_tags: ['通勤'] })],
    { query: '约会', temp: '22', city: '上海', weather: '晴', stylePreferences: '法式、通勤' },
  );
  assert.equal(req.input_mode, 'nl');
  assert.equal(req.query, '约会');
  assert.equal(req.n, 3);
  assert.equal(req.wardrobe[0].fit, '修身');
  assert.equal(req.wardrobe[0].item_id, 't1');
  assert.equal(req.weather.temp_c, 22);
  assert.equal(req.weather.city, '上海');
  assert.deepEqual(req.profile.style_prefs, ['法式', '通勤']);
});

test('toRecommendRequest 只取 active、query 空时退回 tags', () => {
  const req = toRecommendRequest(
    [item({ item_id: 'a', status: 'active' }), item({ item_id: 'b', status: 'archived' as any })],
    { tags: '通勤,黑色' },
  );
  assert.equal(req.wardrobe.length, 1);
  assert.equal(req.wardrobe[0].item_id, 'a');
  assert.equal(req.query, '通勤,黑色');
});

test('outfitsRespToApp 用 itemMap 还原已有单品、映射补充件与理由', () => {
  const items = [item({ item_id: 't1', category: '上装' }), item({ item_id: 'b1', category: '下装' })];
  const outfits = outfitsRespToApp(
    [{ name: '约会', owned_item_ids: ['t1', 'b1', 'nope'],
       recommended_items: [{ name: '丝巾', category: '围巾', color: '米色', description: '点睛' }],
       comment: '顺色显高' }],
    items, 'u1', 's1',
  );
  assert.equal(outfits.length, 1);
  assert.equal(outfits[0].name, '约会');
  assert.equal(outfits[0].ai_comment, '顺色显高');
  assert.equal(outfits[0].user_id, 'u1');
  assert.equal(outfits[0].session_id, 's1');
  assert.equal(outfits[0].source, 'ai_generated');
  assert.equal(outfits[0].items?.length, 2); // 'nope' 被丢弃
  assert.equal(outfits[0].recommended_items?.[0].name, '丝巾');
});
