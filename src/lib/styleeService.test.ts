import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import { serviceRecognize, serviceRecommend, serviceHealth } from './styleeService.ts';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('serviceRecognize 打 /recognize 并解析 json', async () => {
  let seen: any = null;
  globalThis.fetch = (async (url: any, init: any) => {
    seen = { url: String(url), init };
    return { ok: true, json: async () => ({ category: '上装', color: '白色' }) } as any;
  }) as any;
  const r = await serviceRecognize('QUJD', 'image/png');
  assert.match(seen.url, /\/recognize$/);
  assert.equal(seen.init.method, 'POST');
  assert.equal(JSON.parse(seen.init.body).image_b64, 'QUJD');
  assert.equal(r?.category, '上装');
});

test('serviceRecommend 非 2xx 返回 null', async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 500, text: async () => 'err' }) as any) as any;
  const r = await serviceRecommend({ input_mode: 'nl', query: 'x', n: 3, profile: {}, weather: {}, wardrobe: [] });
  assert.equal(r, null);
});

test('serviceHealth 抛异常返回 false（不冒泡）', async () => {
  globalThis.fetch = (async () => { throw new Error('conn refused'); }) as any;
  assert.equal(await serviceHealth(), false);
});
