import assert from 'node:assert';
import { test } from 'node:test';

import { buildTryOnItemBrief } from './tryonItemPolicy.ts';

test('try-on brief preserves garment reference and structural attributes', () => {
  const brief = buildTryOnItemBrief({
    name: '黑色连衣裙',
    category: '连体装',
    color: '黑色',
    material: '醋酸',
    sleeve_length: '无袖',
    fit_type: '修身',
    description: '宽肩无袖连衣裙',
    image_url: 'https://storage.test/dress.png',
  });

  assert.deepEqual(brief, {
    name: '黑色连衣裙',
    category: '连体装',
    color: '黑色',
    material: '醋酸',
    sleeve_length: '无袖',
    fit_type: '修身',
    description: '宽肩无袖连衣裙',
    image_url: 'https://storage.test/dress.png',
    reference_blocked: false,
  });
});

test('failed async-import originals are blocked as try-on references', () => {
  const brief = buildTryOnItemBrief({
    name: '棕色皮腰带',
    category: '配饰',
    color: '棕色',
    image_url: 'https://storage.test/originals/group.png',
    ai_recognized_attrs: {
      async_import: true,
      standardization_ok: false,
      standardization: 'fallback_original',
    },
  });

  assert.equal(brief.image_url, undefined);
  assert.equal(brief.reference_blocked, true);
});

test('a blocked try-on brief stays blocked when normalized more than once', () => {
  const once = buildTryOnItemBrief({
    name: '棕色皮腰带',
    category: '配饰',
    color: '棕色',
    image_url: 'https://storage.test/originals/group.png',
    ai_recognized_attrs: {
      async_import: true,
      standardization_ok: false,
      standardization: 'fallback_original',
    },
  });

  const twice = buildTryOnItemBrief(once);

  assert.equal(twice.image_url, undefined);
  assert.equal(twice.reference_blocked, true);
});

test('try-on brief reads a recognized description preserved in JSON metadata', () => {
  const brief = buildTryOnItemBrief({
    name: '黑色连衣裙',
    category: '连体装',
    color: '黑色',
    ai_recognized_attrs: {
      description: '宽肩无袖连衣裙',
    },
  });

  assert.equal(brief.description, '宽肩无袖连衣裙');
});

test('missing or rejected generated images never fall back to a staged scene image', async () => {
  const policy = await import('./tryonItemPolicy.ts');
  const decide = (policy as typeof policy & {
    decideTryOnGeneration?: (imageUrl: string | null | undefined) => unknown;
  }).decideTryOnGeneration;
  assert.equal(typeof decide, 'function');
  assert.deepEqual(decide?.(null), { ok: false });
  assert.deepEqual(decide?.('https://provider.test/verified.png'), {
    ok: true,
    imageUrl: 'https://provider.test/verified.png',
  });
});
