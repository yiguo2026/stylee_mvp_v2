import type { RecognizeResp, StandardizeResp, RecommendReq, RecommendResp } from './styleeMapping.ts';

export const STYLEE_API = process.env.EXPO_PUBLIC_STYLEE_API ?? 'http://127.0.0.1:8000';

let _notified = false;
const _subs: Array<() => void> = [];
export function subscribeServiceUnavailable(cb: () => void): void { _subs.push(cb); }
function _fireUnavailable(): void {
  if (_notified) return;
  _notified = true;
  console.warn('[stylee] 未连接本地模型服务，已用备用方案');
  for (const cb of _subs) { try { cb(); } catch {} }
}

async function _postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const token = await _accessToken();
    const res = await fetch(`${STYLEE_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) { console.warn(`[stylee] ${path} ${res.status}`); _fireUnavailable(); return null; }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[stylee] ${path} failed:`, e);
    _fireUnavailable();
    return null;
  } finally { clearTimeout(timer); }
}

async function _accessToken(): Promise<string | null> {
  // Do not import the Supabase client in Node-only mapping/service tests.
  if (typeof navigator === 'undefined' && typeof window === 'undefined') return null;
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function serviceHealth(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${STYLEE_API}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch { return false; } finally { clearTimeout(timer); }
}

export async function serviceRecognize(b64: string, mime: string): Promise<RecognizeResp | null> {
  return _postJson<RecognizeResp>('/recognize', { image_b64: b64, mime }, 20000);
}

export async function serviceRecognizeMulti(b64: string, mime: string): Promise<{ items: any[]; provider?: string } | null> {
  return _postJson<{ items: any[]; provider?: string }>('/recognize-multi', { image_b64: b64, mime }, 60000);
}

export async function serviceStandardize(
  b64: string, mime: string, photoType: string, category: string,
  extras?: { color?: string; material?: string; description?: string },
): Promise<StandardizeResp | null> {
  // /standardize 走图生图，给足余量（图像生成偶有尖峰）
  return _postJson<StandardizeResp>('/standardize',
    { image_b64: b64, mime, photo_type: photoType, item: { category, ...extras } }, 60000);
}

export async function serviceRecommend(req: RecommendReq): Promise<RecommendResp | null> {
  // /recommend 走真实 LLM 生成搭配，实测 ~55s，给足余量避免误触发回落
  return _postJson<RecommendResp>('/recommend', req, 90000);
}

export async function serviceFeature<T>(path: string, body: unknown, timeoutMs = 60000): Promise<T | null> {
  return _postJson<T>(path, body, timeoutMs);
}

export async function serviceRegister(username: string, password: string): Promise<{ ok: boolean } | null> {
  return _postJson<{ ok: boolean }>('/register', { username, password }, 15000);
}

// RN/web 専用：本地 uri → base64（Node 無 FileReader，故不在 node --test 覆蓋，靠集成 smoke/手動驗証）
export async function uriToBase64(uri: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const b64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || result);
      };
      reader.readAsDataURL(blob);
    });
    return { b64, mime: blob.type || 'image/jpeg' };
  } catch (e) {
    console.warn('[stylee] uriToBase64 failed:', e);
    return null;
  }
}
