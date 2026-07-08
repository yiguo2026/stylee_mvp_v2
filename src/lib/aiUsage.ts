// AI 用量埋点：统一记录每一次 DeepSeek / Qwen 调用的 usage 与成本。
// 设计原则：埋在唯一出口（deepseek.ts / dashscope.ts），fire-and-forget，
// 埋点失败绝不影响主流程。100% 覆盖当前与未来所有调用。
import * as Device from 'expo-device';
import { useUserStore } from '@/stores/userStore';

// 用量监控专用库（与 App 主后端解耦：写进模型方自己的 Supabase，独立掌控）。
// publishable key 公开安全（RLS 仅允许写/读 ai_usage_logs 一张表）。可用 env 覆盖。
const MON_URL = process.env.EXPO_PUBLIC_USAGE_SUPABASE_URL ?? 'https://nseysksfnfcaioixifbx.supabase.co';
const MON_KEY = process.env.EXPO_PUBLIC_USAGE_SUPABASE_KEY ?? 'sb_publishable_fBm4EGpa4a1GJL4T2LWKQQ_ISXyIS_Z';

// ── 定价（元 / 百万 tokens；图像为 元 / 张）─────────────────────
// DeepSeek 为官方实价（api-docs.deepseek.com/zh-cn/quick_start/pricing）。
// Qwen 单价请去阿里云百炼控制台核对后填入（填 0 则成本按 0 计，但 token/张数照记）。
type Price = { inHit?: number; inMiss?: number; out?: number; perImage?: number };
const PRICING: Record<string, Price> = {
  'deepseek-v4-flash': { inHit: 0.02, inMiss: 1, out: 2 },
  'deepseek-v4-pro': { inHit: 0.025, inMiss: 3, out: 6 },
  // TODO(团队): 填 Qwen 实价后成本才准（现记 token/张数，成本按 0）
  // Qwen 图像(百炼实价,元/张)
  'qwen-image-2.0-pro': { perImage: 0.5 },
  'qwen-image-edit': { perImage: 0.3 },
  'qwen-image-2.0': { perImage: 0.2 },
  'qwen-image': { perImage: 0.25 },
  // qwen3-vl-plus 未在价表,按 instruct 档估(2/8);VL 成本占比小,待精确
  'qwen3-vl-plus': { inMiss: 2, out: 8 },
  'text-embedding-v4': { inMiss: 0, out: 0 },  // TODO 待补(便宜)
  // 火山 Ark / doubao（当前 key 默认空停用；填价后成本才准）
  'doubao-seed-2-0-pro-260215': { inMiss: 0, out: 0 },
  'doubao-seedream-5-0-260128': { perImage: 0 },
};

// 自动身份（同伴零配置）：优先显式 EXPO_PUBLIC_DEV_TAG；否则用设备名（如「张三的 MacBook」）；
// web 无设备名时持久化一个短 id。谁都不用手动设。
function resolveDevTag(): string {
  const explicit = process.env.EXPO_PUBLIC_DEV_TAG;
  if (explicit) return explicit;
  if (Device.deviceName) return Device.deviceName;
  try {
    if (typeof localStorage !== 'undefined') {
      let id = localStorage.getItem('ai_usage_device');
      if (!id) { id = 'web-' + Math.random().toString(36).slice(2, 8); localStorage.setItem('ai_usage_device', id); }
      return id;
    }
  } catch { /* noop */ }
  return `${Device.osName ?? 'device'}-unknown`;
}
const DEV_TAG = resolveDevTag();

// 当前登录账号（零配置的「谁」；同伴测试都要登录）
function currentUserId(): string | null {
  try { return useUserStore.getState().user?.id ?? null; } catch { return null; }
}

export interface AiUsageRecord {
  provider: 'deepseek' | 'qwen' | 'ark';
  model: string;
  feature: string;
  callType: 'chat' | 'vision' | 'image';
  promptTokens?: number;
  cachedTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  imageCount?: number;
  durationMs: number;
  ok: boolean;
  requestId?: string;
  userId?: string | null;
}

function computeCost(r: AiUsageRecord): number {
  const p = PRICING[r.model];
  if (!p) return 0;
  let c = 0;
  if (p.perImage && r.imageCount) c += p.perImage * r.imageCount;
  const hit = r.cachedTokens ?? 0;
  const miss = Math.max(0, (r.promptTokens ?? 0) - hit);
  if (p.inHit) c += (hit * p.inHit) / 1e6;
  if (p.inMiss) c += (miss * p.inMiss) / 1e6;
  if (p.out) c += ((r.completionTokens ?? 0) * p.out) / 1e6;
  return c;
}

// feature 识别：从 prompt 前缀匹配已知功能；新功能自动记为 other:<签名>，永不漏。
const FEATURE_SIGNATURES: [string, string][] = [
  ['你是一个专业穿搭顾问', 'recommend'],
  ['穿搭意图识别', 'intent-tags'],
  ['生成一段2-3句话的搭配理由', 'outfit-reason'],
  ['根据以下商品链接', 'link-extract'],
  ['给出试穿建议', 'tryon-suggestion'],
  ['识别这张照片中所有', 'multi-detect'],
  ['识别这件衣物的属性', 'recognize'],
  ['全身照', 'tryon-image'],
  ['纯白', 'standardize'],
];
export function detectFeature(promptText: string): string {
  const t = promptText || '';
  for (const [sig, name] of FEATURE_SIGNATURES) if (t.includes(sig)) return name;
  return 'other:' + t.slice(0, 24).replace(/\s+/g, ' ');
}

export function logAiUsage(r: AiUsageRecord): void {
  try {
    const cost = computeCost(r);
    const total = (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
    // 本地开发可见
    // eslint-disable-next-line no-console
    console.log(
      `[ai-usage] ${r.provider}/${r.model} ${r.feature} ` +
      `tok=${total || '-'} img=${r.imageCount ?? '-'} cost=¥${cost.toFixed(5)} ${r.durationMs}ms ${r.ok ? 'ok' : 'fail'}`,
    );
    const row = {
      provider: r.provider, model: r.model, feature: r.feature, call_type: r.callType,
      dev_tag: DEV_TAG, user_id: r.userId ?? currentUserId(),
      prompt_tokens: r.promptTokens ?? null, cached_tokens: r.cachedTokens ?? null,
      completion_tokens: r.completionTokens ?? null, reasoning_tokens: r.reasoningTokens ?? null,
      total_tokens: total || null, image_count: r.imageCount ?? null,
      cost_cny: cost, duration_ms: r.durationMs, ok: r.ok, request_id: r.requestId ?? null,
    };
    if (MON_URL && MON_KEY) {
      // 直连监控库 REST，fire-and-forget；失败只 warn，绝不影响主流程
      void fetch(`${MON_URL}/rest/v1/ai_usage_logs`, {
        method: 'POST',
        headers: {
          'apikey': MON_KEY,
          'Authorization': `Bearer ${MON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(row),
      }).catch((e) => console.warn('[ai-usage] post failed:', e));
    }
  } catch (e) {
    console.warn('[ai-usage] log error:', e);
  }
}
