import assert from 'node:assert';
import { test } from 'node:test';

import { matchesWardrobeSearch } from './wardrobeSearchPolicy.ts';

const item = (name: string, category: string, color = '米色') => ({
  name,
  category,
  color,
  brand: '',
  material: '针织',
});

test('hat queries exclude scarf names even though both use 帽巾', () => {
  assert.equal(matchesWardrobeSearch(item('棒球帽', '帽巾', '白色'), '帽'), true);
  assert.equal(matchesWardrobeSearch(item('针织冷帽', '帽巾', '黑色'), '帽子'), true);
  assert.equal(matchesWardrobeSearch(item('纯色针织围巾', '帽巾'), '帽'), false);
});

test('scarf queries exclude hats', () => {
  assert.equal(matchesWardrobeSearch(item('纯色针织围巾', '帽巾'), '围巾'), true);
  assert.equal(matchesWardrobeSearch(item('真丝丝巾', '帽巾'), '丝巾'), true);
  assert.equal(matchesWardrobeSearch(item('针织冷帽', '帽巾', '黑色'), '围巾'), false);
});

test('ordinary aliases and category matching remain available', () => {
  assert.equal(matchesWardrobeSearch(item('灰色卫衣', '上装', '灰色'), '上衣'), true);
  assert.equal(matchesWardrobeSearch(item('黑色直筒裤', '下装', '黑色'), '裤子'), true);
  assert.equal(matchesWardrobeSearch(item('小白鞋', '鞋履', '白色'), '鞋'), true);
  assert.equal(matchesWardrobeSearch(item('灰色卫衣', '上装', '灰色'), '帽'), false);
});
