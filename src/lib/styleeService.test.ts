import { test, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  serviceHealth,
  serviceRecognize,
  serviceRecognizeMultiDetailed,
  serviceRecommend,
  serviceRecommendDetailed,
  serviceStandardizeDetailed,
} from './styleeService.ts';

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

test('serviceRecommendDetailed 保留服务端阶段、错误类型和请求 ID', async () => {
  let clientRequestId = '';
  globalThis.fetch = (async (_url: any, init: any) => {
    clientRequestId = init.headers['X-Request-ID'];
    return {
      ok: false,
      status: 504,
      text: async () => JSON.stringify({
        error: 'model_service_error',
        message: 'upstream timed out',
        request_id: clientRequestId,
        stage: 'B3.generate_outfits',
        error_type: 'TimeoutError',
        duration_ms: 45012,
      }),
    } as any;
  }) as any;

  const result = await serviceRecommendDetailed({
    input_mode: 'nl', query: 'x', n: 3, profile: {}, weather: {}, wardrobe: [],
  });

  assert.equal(result.data, null);
  assert.match(clientRequestId, /^stylee-/);
  assert.equal(result.error?.requestId, clientRequestId);
  assert.equal(result.error?.stage, 'B3.generate_outfits');
  assert.equal(result.error?.errorType, 'TimeoutError');
  assert.equal(result.error?.serverDurationMs, 45012);
});

test('serviceRecognizeMultiDetailed 保留识别失败阶段和请求 ID', async () => {
  let clientRequestId = '';
  globalThis.fetch = (async (url: any, init: any) => {
    assert.match(String(url), /\/recognize-multi$/);
    clientRequestId = init.headers['X-Request-ID'];
    return {
      ok: false,
      status: 504,
      text: async () => JSON.stringify({
        error: 'model_service_error',
        message: 'upstream recognition timed out',
        request_id: clientRequestId,
        stage: 'A1.multi_vision_recognize',
        error_type: 'ProviderTimeoutError',
        duration_ms: 50748,
        retryable: true,
      }),
    } as any;
  }) as any;

  const result = await serviceRecognizeMultiDetailed('QUJD', 'image/png');

  assert.equal(result.data, null);
  assert.equal(result.error?.requestId, clientRequestId);
  assert.equal(result.error?.stage, 'A1.multi_vision_recognize');
  assert.equal(result.error?.errorType, 'ProviderTimeoutError');
  assert.equal(result.error?.serverDurationMs, 50748);
  assert.equal(result.error?.retryable, true);
});

test('serviceStandardizeDetailed requests web standardization and preserves response trace', async () => {
  let seen: any = null;
  globalThis.fetch = (async (url: any, init: any) => {
    seen = { url: String(url), init };
    return {
      ok: true,
      json: async () => ({
        image_ref: 'data:image/png;base64,iVBORw0KGgo=',
        method: 'cutout_alpha',
        verified: true,
        mime: 'image/png',
        background: 'transparent',
        alpha_verified: true,
        provider: 'qwen-image-edit',
        trace: {
          request_id: 'server-standardize-123',
          duration_ms: 3210,
          stage_ms: { standardize: 3000, verify: 210 },
        },
      }),
    } as any;
  }) as any;

  const result = await serviceStandardizeDetailed('QUJD', 'image/png', 'web', '上装');

  assert.match(seen.url, /\/standardize$/);
  assert.equal(seen.init.method, 'POST');
  assert.match(seen.init.headers['X-Request-ID'], /^stylee-/);
  assert.deepEqual(JSON.parse(seen.init.body), {
    image_b64: 'QUJD',
    mime: 'image/png',
    photo_type: 'web',
    item: { category: '上装' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.data?.trace?.request_id, 'server-standardize-123');
  assert.equal(result.data?.trace?.duration_ms, 3210);
  assert.deepEqual(result.data?.trace?.stage_ms, { standardize: 3000, verify: 210 });
});

test('serviceHealth 抛异常返回 false（不冒泡）', async () => {
  globalThis.fetch = (async () => { throw new Error('conn refused'); }) as any;
  assert.equal(await serviceHealth(), false);
});
