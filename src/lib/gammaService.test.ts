import assert from 'node:assert/strict';
import { toGammaWardrobe } from './gammaService.ts';

const result = toGammaWardrobe([{
  item_id: 'owned-1', user_id: 'u1', name: '白T恤', category: '上装', color: '白色',
  image_url: 'https://example.com/t.png', source_type: 'manual', status: 'active',
  created_at: '', updated_at: '',
}, {
  item_id: 'failed-original', user_id: 'u1', name: '合照原图', category: '上装', color: '米色',
  image_url: 'https://example.com/group.jpg', source_type: 'album_ai', status: 'active',
  ai_recognized_attrs: {
    async_import: true,
    standardization_ok: false,
    standardization: 'fallback_original',
  },
  created_at: '', updated_at: '',
}]);

assert.equal(result.length, 1);
assert.deepEqual(result[0], {
  item_id: 'owned-1', name: '白T恤', category: '上装', color: '白色', material: undefined,
  fit_type: undefined, season: undefined, occasion_tags: undefined,
  image_url: 'https://example.com/t.png',
});
console.log('ok');

const gammaModule = await import('./gammaService.ts');
const toGammaTryOnItems = (gammaModule as typeof gammaModule & {
  toGammaTryOnItems?: (items: unknown[]) => unknown[];
}).toGammaTryOnItems;
assert.equal(typeof toGammaTryOnItems, 'function');
assert.deepEqual(toGammaTryOnItems?.([{
  name: '黑色连衣裙',
  category: '连体装',
  color: '黑色',
  material: '醋酸',
  sleeve_length: '无袖',
  fit_type: '修身',
  description: '宽肩无袖连衣裙',
  image_url: 'https://example.com/dress.png',
}]), [{
  name: '黑色连衣裙',
  category: '连体装',
  color: '黑色',
  material: '醋酸',
  sleeve_length: '无袖',
  fit_type: '修身',
  description: '宽肩无袖连衣裙',
  image_url: 'https://example.com/dress.png',
}]);
