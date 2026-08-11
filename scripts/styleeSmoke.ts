// @ts-nocheck
// 用法：先在模型仓起服务，再 `node scripts/styleeSmoke.ts <图片路径>`
import { readFileSync } from 'node:fs';
import { serviceHealth, serviceRecognize, serviceStandardize, serviceRecommend } from '../src/lib/styleeService.ts';
import { toRecommendRequest } from '../src/lib/styleeMapping.ts';

const imgPath = process.argv[2] ?? 'assets/tryon/casual.png';
const b64 = readFileSync(imgPath).toString('base64');

const main = async () => {
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
    throw new Error('transparent standardization contract failed');
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
};
main();
