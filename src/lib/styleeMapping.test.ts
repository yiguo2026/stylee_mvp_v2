import { test } from 'node:test';
import assert from 'node:assert';
import type { WardrobeItem } from '@/types';
import { compactRecommendedName, normalizePhotoType, recognizeManyItemToDetected, recognizeRespToResult, toRecommendRequest, outfitsRespToApp } from './styleeMapping.ts';

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

test('photo_type 旧值归一化，多品识别元数据不丢失', () => {
  assert.equal(normalizePhotoType('flat'), 'flatlay');
  assert.equal(normalizePhotoType('flat_lay'), 'flatlay');
  assert.equal(normalizePhotoType('product'), 'web');
  assert.equal(normalizePhotoType('unknown'), 'on_body');
  const item = recognizeManyItemToDetected({
    category: '上装', color: '白色', brand: 'A', sleeve_length: '短袖',
    style: '简约', photo_type: 'flatlay', needs_review: true, confidence: 0.7,
    description: '白色T恤',
  }, 0);
  assert.equal(item.photo_type, 'flatlay');
  assert.equal(item.brand, 'A');
  assert.equal(item.sleeve_length, '短袖');
  assert.equal(item.needs_review, true);
  assert.equal(item.confidence, 0.7);
});

test('multi-item recognition preserves only a valid normalized target box', () => {
  const valid = recognizeManyItemToDetected({
    category: '包袋',
    color: '米色',
    description: '藤编水桶包',
    bbox_2d: [80, 120, 360, 620],
  } as any, 0);
  const invalid = recognizeManyItemToDetected({
    category: '鞋履',
    color: '粉色',
    description: '乐福鞋',
    bbox_2d: [400, 500, 200, 900],
  } as any, 1);

  assert.deepEqual(valid.bbox_2d, [80, 120, 360, 620]);
  assert.equal(invalid.bbox_2d, undefined);
});

test('recognition rejects unsupported sleeve values before database persistence', () => {
  const many = recognizeManyItemToDetected({
    category: '上装',
    color: '黑色',
    description: '黑色七分袖上衣',
    sleeve_length: '七分袖',
    needs_review: false,
  }, 0);
  const single = recognizeRespToResult({
    category: '上装', color: '黑色', material: '', style: '', brand: '',
    photo_type: 'flatlay', needs_review: false, confidence: 0.9,
    sleeve_length: '七分袖',
  });

  assert.equal(many.sleeve_length, undefined);
  assert.equal(many.needs_review, true);
  assert.equal(single.sleeve_length, undefined);
  assert.equal(single.needs_review, true);
});

test('toRecommendRequest 映射 fit_type→fit、拆 style_prefs、temp→temp_c', () => {
  const req = toRecommendRequest(
    [item({ item_id: 't1', category: '上装', fit_type: '修身', color: '白', material: '棉', season: ['春'], occasion_tags: ['通勤'], tags: [
      { tag_id: 'style-1', tag_name: '法式慵懒', tag_type: 'style' },
      { tag_id: 'occasion-1', tag_name: '通勤', tag_type: 'occasion' },
    ] })],
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
  assert.deepEqual(req.wardrobe[0].style_tags, ['法式慵懒']);
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

test('toRecommendRequest excludes failed async-import originals until explicitly confirmed', () => {
  const req = toRecommendRequest([
    item({ item_id: 'legacy-active', status: 'active' }),
    item({
      item_id: 'failed-batch-original',
      status: 'active',
      ai_recognized_attrs: {
        async_import: true,
        standardization_ok: false,
        standardization: 'fallback_original',
      },
    }),
    item({
      item_id: 'confirmed-single-original',
      status: 'active',
      ai_recognized_attrs: {
        async_import: true,
        standardization_ok: false,
        standardization: 'fallback_original',
        user_confirmed_original: true,
        detected_item_count: 1,
      },
    }),
  ]);

  assert.deepEqual(
    req.wardrobe.map((entry) => entry.item_id),
    ['legacy-active', 'confirmed-single-original'],
  );
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

test('推荐补位名称去掉购买建议句，只保留简短单品名', () => {
  assert.equal(
    compactRecommendedName('补：建议购买一件适合海岛度假的浅蓝色牛仔短裤', '下装'),
    '浅蓝色牛仔短裤',
  );
  assert.equal(
    compactRecommendedName('建议选择一双透气轻便的白色帆布鞋', '鞋履'),
    '白色帆布鞋',
  );
});

test('validated layout_items map onto owned and recommended items', () => {
  const wardrobe = [item({ item_id: 't1', category: '上装' }), item({ item_id: 'b1', category: '下装' })];
  const [outfit] = outfitsRespToApp([{
    name: '通勤',
    owned_item_ids: ['t1', 'b1'],
    recommended_items: [{ name: '乐福鞋', category: '鞋履', color: '白色' }],
    comment: '',
    layout_items: [
      { source: 'owned', item_id: 't1', layout_role: 'base' },
      { source: 'owned', item_id: 'b1', layout_role: 'bottom' },
      { source: 'recommended', recommended_index: 0, layout_role: 'shoes' },
    ],
  }], wardrobe, 'u1', 's1');
  assert.equal(outfit.items?.[0].role, 'base');
  assert.equal(outfit.items?.[1].role, 'bottom');
  assert.equal(outfit.recommended_items?.[0].role, 'shoes');
});

test('invalid layout entries degrade locally without dropping n', () => {
  const wardrobe = [item({ item_id: 't1', category: '上装' }), item({ item_id: 'b1', category: '下装' })];
  const [outfit] = outfitsRespToApp([{
    name: '兼容',
    owned_item_ids: ['t1', 'b1'],
    recommended_items: [{ name: '围巾', category: '帽巾', color: '米色' }],
    comment: '',
    layout_items: [
      { source: 'owned', item_id: 't1', layout_role: 'unknown' as never },
      { source: 'owned', item_id: 'b1', layout_role: 'bottom' },
      { source: 'owned', item_id: 'b1', layout_role: 'base' },
      { source: 'recommended', recommended_index: 8, layout_role: 'scarf' },
    ],
  }], wardrobe, 'u1', 's1');
  assert.equal(outfit.items?.length, 2);
  assert.equal(outfit.recommended_items?.length, 1);
  assert.equal(outfit.items?.[0].role, undefined);
  assert.equal(outfit.items?.[1].role, undefined);
  assert.equal(outfit.recommended_items?.[0].role, undefined);
});

test('malformed layout entries do not interrupt outfit mapping', () => {
  const wardrobe = [item({ item_id: 't1', category: '上装' })];
  const [outfit] = outfitsRespToApp([{
    name: '兼容',
    owned_item_ids: ['t1'],
    recommended_items: [],
    comment: '',
    layout_items: [null as never, { source: 'owned', item_id: 't1', layout_role: 'base' }],
  }], wardrobe, 'u1', 's1');
  assert.equal(outfit.items?.length, 1);
  assert.equal(outfit.items?.[0].role, 'base');
});

test('unknown owned role permanently invalidates a later valid duplicate target', () => {
  const wardrobe = [item({ item_id: 't1', category: '上装' })];
  const [outfit] = outfitsRespToApp([{
    name: '兼容',
    owned_item_ids: ['t1'],
    recommended_items: [],
    comment: '',
    layout_items: [
      { source: 'owned', item_id: 't1', layout_role: 'unknown' as never },
      { source: 'owned', item_id: 't1', layout_role: 'base' },
    ],
  }], wardrobe, 'u1', 's1');

  assert.equal(outfit.items?.length, 1);
  assert.equal(outfit.items?.[0].role, undefined);
});

test('duplicate and unknown recommended targets cannot regain a trusted role', () => {
  const [outfit] = outfitsRespToApp([{
    name: '兼容',
    owned_item_ids: [],
    recommended_items: [
      { name: '丝巾', category: '帽巾', color: '米色' },
      { name: '珍珠耳饰', category: '配饰', color: '白色' },
    ],
    comment: '',
    layout_items: [
      { source: 'recommended', recommended_index: 0, layout_role: 'scarf' },
      { source: 'recommended', recommended_index: 0, layout_role: 'accessory' },
      { source: 'recommended', recommended_index: 1, layout_role: 'unknown' as never },
      { source: 'recommended', recommended_index: 1, layout_role: 'accessory' },
    ],
  }], [], 'u1', 's1');

  assert.equal(outfit.recommended_items?.length, 2);
  assert.equal(outfit.recommended_items?.[0].role, undefined);
  assert.equal(outfit.recommended_items?.[1].role, undefined);
});
