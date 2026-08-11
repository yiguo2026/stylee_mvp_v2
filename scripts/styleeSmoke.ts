// @ts-nocheck
// 用法：先在模型仓起服务，再 `node scripts/styleeSmoke.ts <图片路径>`
import { readFileSync } from 'node:fs';
import { serviceHealth, serviceRecognize, serviceStandardize, serviceRecommend } from '../src/lib/styleeService.ts';
import { toRecommendRequest } from '../src/lib/styleeMapping.ts';

const SAFE_LOGGING_SELF_TEST = '--self-test-safe-logging';

const SAFE_ERROR_KINDS = new Set(['error', 'http', 'network', 'timeout', 'contract']);
const SAFE_ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError']);
const SAFE_ERROR_STAGES = new Set(['top_level', 'health', 'recognize', 'standardize', 'recommend', 'self_test']);

const allowlistedScalar = (value: unknown, allowed: Set<string>, fallback: string): string => (
  typeof value === 'string' && allowed.has(value) ? value : fallback
);

const safeErrorScalars = (error: unknown) => {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  return {
    kind: allowlistedScalar(record.kind, SAFE_ERROR_KINDS, 'error'),
    name: allowlistedScalar(record.name, SAFE_ERROR_NAMES, 'Error'),
    stage: allowlistedScalar(record.stage, SAFE_ERROR_STAGES, 'top_level'),
  };
};

const withServiceDiagnosticsSuppressed = async <T>(operation: () => Promise<T>): Promise<T> => {
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await operation();
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
};

const main = async () => {
  const imgPath = process.argv[2] ?? 'assets/tryon/casual.png';
  const b64 = readFileSync(imgPath).toString('base64');
  await withServiceDiagnosticsSuppressed(async () => {
    const health = await serviceHealth();
    console.log('health:', health);
    const rec = await serviceRecognize(b64, 'image/png');
    console.log('recognize:', rec ? {
      category: rec.category,
      photo_type: rec.photo_type,
      needs_review: rec.needs_review,
      confidence: rec.confidence,
    } : null);
    const std = await serviceStandardize(b64, 'image/png', rec?.photo_type ?? 'flatlay', rec?.category ?? '上装');
    const safeStd = std ? {
      verified: std.verified,
      alpha_verified: std.alpha_verified,
      background: std.background,
      mime: std.mime,
      method: std.method,
      matte_provider: std.matte_provider,
      failure_stage: std.failure_stage,
      image_ref_kind: std.image_ref.startsWith('data:image/png;base64,') ? 'png_data_uri' : 'unexpected',
      image_ref_chars: std.image_ref.length,
    } : null;
    console.log('standardize:', safeStd);
    if (!std?.verified || !std.alpha_verified || std.background !== 'transparent' ||
        std.mime !== 'image/png' || safeStd?.image_ref_kind !== 'png_data_uri') {
      throw Object.assign(new Error('transparent standardization contract failed'), {
        kind: 'contract',
        stage: 'standardize',
      });
    }
    const req = toRecommendRequest(
      [{ item_id: 't1', name: '白衬衫', category: '上装', color: '白', material: '棉', status: 'active' } as any,
       { item_id: 'b1', name: '阔腿裤', category: '下装', color: '米', status: 'active' } as any],
      { query: '周末约会', temp: '22', city: '上海', weather: '晴', stylePreferences: '法式' },
    );
    const out = await serviceRecommend(req);
    console.log('recommend:', {
      outfit_count: out?.outfits?.length ?? 0,
      trace_present: Boolean(out?.trace),
      degraded: out?.trace?.degraded ?? false,
    });
  });
};

const runSafeLoggingSelfTest = async (): Promise<void> => {
  const originalWarn = console.warn;
  const originalError = console.error;
  const syntheticSensitive = [
    ['data:image/png', 'base64,SAFE_LOGGING_TEST_ONLY'].join(';'),
    ['DASHSCOPE', 'API_KEY=SAFE_LOGGING_TEST_ONLY'].join('_'),
  ].join(' ');

  try {
    await withServiceDiagnosticsSuppressed(async () => {
      console.warn(syntheticSensitive);
      console.error(syntheticSensitive);
      const syntheticError = new Error(syntheticSensitive);
      syntheticError.name = syntheticSensitive;
      throw Object.assign(syntheticError, {
        kind: 'network',
        stage: 'self_test',
      });
    });
  } catch (error) {
    if (console.warn !== originalWarn || console.error !== originalError) {
      throw Object.assign(new Error(syntheticSensitive), {
        kind: 'error',
        stage: 'self_test',
      });
    }
    throw error;
  }
};

const reportSafeTopLevelError = (error: unknown): void => {
  const safe = safeErrorScalars(error);
  console.error(
    'styleeSmoke failure',
    `kind=${safe.kind}`,
    `name=${safe.name}`,
    `stage=${safe.stage}`,
  );
  process.exitCode = 1;
};

const entry = process.argv[2] === SAFE_LOGGING_SELF_TEST ? runSafeLoggingSelfTest() : main();
void entry.catch(reportSafeTopLevelError);
