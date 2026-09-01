import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test, after, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import ts from 'typescript';
import {
  serviceHealth,
  serviceRecognize,
  serviceRecognizeMultiDetailed,
  serviceRecommend,
  serviceRecommendDetailed,
  serviceStandardizeDetailed,
} from './styleeService.ts';

const libDir = new URL('./', import.meta.url);
const aiModuleHooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/types') {
      return { url: new URL('../types/index.ts', libDir).href, shortCircuit: true };
    }
    if (specifier.startsWith('@/lib/')) {
      return {
        url: new URL(`./${specifier.slice('@/lib/'.length)}.ts`, libDir).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});

const realFetch = globalThis.fetch;
const realFileReader = globalThis.FileReader;
const realSetTimeout = globalThis.setTimeout;
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.FileReader = realFileReader;
  globalThis.setTimeout = realSetTimeout;
});
after(() => { aiModuleHooks.deregister(); });

const transparentPng = 'data:image/png;base64,iVBORw0KGgo=';

class NodeTestFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;

  async readAsDataURL(blob: Blob): Promise<void> {
    const bytes = Buffer.from(await blob.arrayBuffer()).toString('base64');
    this.result = `data:${blob.type};base64,${bytes}`;
    this.onloadend?.();
  }
}

function installStandardizationFetch(response: Record<string, unknown>): () => number {
  let requests = 0;
  globalThis.FileReader = NodeTestFileReader as unknown as typeof FileReader;
  globalThis.fetch = (async (url: any) => {
    if (String(url) === 'test://garment') {
      return { blob: async () => new Blob(['ABC'], { type: 'image/png' }) } as any;
    }
    assert.match(String(url), /\/standardize$/);
    requests += 1;
    return response as any;
  }) as any;
  return () => requests;
}

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

  const result = await serviceStandardizeDetailed(
    'QUJD',
    'image/png',
    'web',
    '上装',
    { bbox_2d: [80, 120, 360, 620] } as any,
  );

  assert.match(seen.url, /\/standardize$/);
  assert.equal(seen.init.method, 'POST');
  assert.match(seen.init.headers['X-Request-ID'], /^stylee-/);
  assert.deepEqual(JSON.parse(seen.init.body), {
    image_b64: 'QUJD',
    mime: 'image/png',
    photo_type: 'web',
    item: { category: '上装', bbox_2d: [80, 120, 360, 620] },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.data?.trace?.request_id, 'server-standardize-123');
  assert.equal(result.data?.trace?.duration_ms, 3210);
  assert.deepEqual(result.data?.trace?.stage_ms, { standardize: 3000, verify: 210 });
});

test('serviceStandardizeDetailed normalizes legacy flat_lay at the request boundary', async () => {
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url: any, init: any) => {
    requestBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({}) } as any;
  }) as any;

  await serviceStandardizeDetailed('QUJD', 'image/png', 'flat_lay', '上装');

  const body = requestBody as Record<string, unknown> | null;
  assert.equal(body?.photo_type, 'flatlay');
});

test('serviceStandardizeDetailed leaves enough client time for edit plus verification', async () => {
  let scheduledDeadline = 0;
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number) => {
    scheduledDeadline = Number(timeout);
    return realSetTimeout(handler, 10_000);
  }) as typeof setTimeout;
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({}),
  }) as any) as any;

  await serviceStandardizeDetailed('QUJD', 'image/png', 'flatlay', '上装');

  assert.equal(scheduledDeadline, 120_000);
});

test('aiStandardizeGarment accepts a verified transparent result without skipping web images', async () => {
  const requestCount = installStandardizationFetch({
    ok: true,
    json: async () => ({
      image_ref: transparentPng,
      method: 'cutout_alpha',
      verified: true,
      mime: 'image/png',
      background: 'transparent',
      alpha_verified: true,
      provider: 'qwen-image-edit',
      trace: { request_id: 'standardize-success', duration_ms: 1234 },
    }),
  });
  const { aiStandardizeGarment } = await import('./ai.ts');

  const result = await aiStandardizeGarment('test://garment', '上装', 'web');

  assert.equal(requestCount(), 1);
  assert.equal(result.skipped, false);
  assert.equal(result.url, transparentPng);
  assert.equal(result.acceptance.ok, true);
  assert.equal(result.meta.ok, true);
  assert.equal(result.meta.source, 'model-service/qwen-image-edit/cutout_alpha');
  assert.equal(result.meta.requestId, 'standardize-success');
  assert.equal(result.meta.serverDurationMs, 1234);
});

test('aiStandardizeGarment strictly rejects an unverified transparent response', async () => {
  const requestCount = installStandardizationFetch({
    ok: true,
    json: async () => ({
      image_ref: transparentPng,
      method: 'cutout_alpha',
      verified: true,
      mime: 'image/png',
      background: 'transparent',
      alpha_verified: false,
      failure_stage: 'transparent_verify',
      provider: 'qwen-image-edit',
      trace: { request_id: 'standardize-rejected', duration_ms: 2345 },
    }),
  });
  const { aiStandardizeGarment } = await import('./ai.ts');

  const result = await aiStandardizeGarment('test://garment', '上装', 'product');

  assert.equal(requestCount(), 1);
  assert.equal(result.url, null);
  assert.equal(result.acceptance.ok, false);
  if (!result.acceptance.ok) assert.equal(result.acceptance.reason, 'unverified');
  assert.equal(result.meta.ok, false);
  assert.equal(result.meta.source, 'model-service/qwen-image-edit/cutout_alpha');
  assert.equal(result.meta.failedStage, 'transparent_verify');
  assert.equal(result.meta.requestId, 'standardize-rejected');
  assert.equal(result.meta.serverDurationMs, 2345);
});

test('aiStandardizeGarment maps detailed service errors without returning image bytes', async () => {
  const requestCount = installStandardizationFetch({
    ok: false,
    status: 504,
    headers: { get: () => null },
    text: async () => JSON.stringify({
      error: 'model_service_error',
      message: 'standardization timed out',
      request_id: 'standardize-error',
      stage: 'C2.transparent_verify',
      error_type: 'ProviderTimeoutError',
      duration_ms: 4567,
      retryable: true,
    }),
  });
  const { aiStandardizeGarment } = await import('./ai.ts');

  const result = await aiStandardizeGarment('test://garment', '上装', 'flatlay');

  assert.equal(requestCount(), 1);
  assert.equal(result.url, null);
  assert.equal(result.acceptance.ok, false);
  if (!result.acceptance.ok) assert.equal(result.acceptance.reason, 'missing');
  assert.equal(result.meta.ok, false);
  assert.equal(result.meta.source, 'model-service/model/standardize');
  assert.equal(result.meta.failedStage, 'C2.transparent_verify');
  assert.equal(result.meta.requestId, 'standardize-error');
  assert.equal(result.meta.errorType, 'ProviderTimeoutError');
  assert.equal(result.meta.serverDurationMs, 4567);
});

test('serviceHealth 抛异常返回 false（不冒泡）', async () => {
  globalThis.fetch = (async () => { throw new Error('conn refused'); }) as any;
  assert.equal(await serviceHealth(), false);
});
