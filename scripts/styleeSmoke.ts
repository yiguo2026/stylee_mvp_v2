// @ts-nocheck
// 用法：先在模型仓起服务，再 `node scripts/styleeSmoke.ts <图片路径>`
import { readFileSync } from 'node:fs';
import { serviceHealth, serviceRecognize, serviceStandardize, serviceRecommend } from '../src/lib/styleeService.ts';
import { toRecommendRequest } from '../src/lib/styleeMapping.ts';

const imgPath = process.argv[2] ?? 'assets/tryon/casual.png';
const b64 = readFileSync(imgPath).toString('base64');

const main = async () => {
  console.log('health:', await serviceHealth());
  const rec = await serviceRecognize(b64, 'image/png');
  console.log('recognize:', rec);
  const std = await serviceStandardize(b64, 'image/png', rec?.photo_type ?? 'flat', rec?.category ?? '上装');
  console.log('standardize:', std ? { ...std, image_ref: String(std.image_ref).slice(0, 60) } : null);
  const req = toRecommendRequest(
    [{ item_id: 't1', name: '白衬衫', category: '上装', color: '白', material: '棉', status: 'active' } as any,
     { item_id: 'b1', name: '阔腿裤', category: '下装', color: '米', status: 'active' } as any],
    { query: '周末约会', temp: '22', city: '上海', weather: '晴', stylePreferences: '法式' },
  );
  const out = await serviceRecommend(req);
  console.log('recommend outfits:', out?.outfits?.length, 'trace:', out?.trace);
};
main();
