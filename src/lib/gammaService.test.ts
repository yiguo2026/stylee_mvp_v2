import assert from 'node:assert/strict';
import { toGammaWardrobe } from './gammaService.ts';

const result = toGammaWardrobe([{
  item_id: 'owned-1', user_id: 'u1', name: '白T恤', category: '上装', color: '白色',
  image_url: 'https://example.com/t.png', source_type: 'manual', status: 'active',
  created_at: '', updated_at: '',
}]);

assert.deepEqual(result[0], {
  item_id: 'owned-1', name: '白T恤', category: '上装', color: '白色', material: undefined,
  fit_type: undefined, season: undefined, occasion_tags: undefined,
  image_url: 'https://example.com/t.png',
});
console.log('ok');
