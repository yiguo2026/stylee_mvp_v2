import type { RecognizeResp, RecognizeManyResp, StandardizeResp, RecommendReq, RecommendResp } from './styleeMapping.ts';

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

export interface ServiceErrorInfo {
  kind: 'http' | 'timeout' | 'network';
  path: string;
  message: string;
  requestId: string;
  status?: number;
  stage?: string;
  errorType?: string;
  serverDurationMs?: number;
  retryable?: boolean;
}

export interface ServiceResult<T> {
  data: T | null;
  error?: ServiceErrorInfo;
}

function _requestId(): string {
  return `stylee-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function _errorBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const text = await res.text();
    if (!text) return {};
    try { return JSON.parse(text) as Record<string, unknown>; }
    catch { return { message: text.slice(0, 400) }; }
  } catch {
    return {};
  }
}

async function _postJsonDetailed<T>(path: string, body: unknown, timeoutMs: number): Promise<ServiceResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const requestId = _requestId();
  try {
    const token = await _accessToken();
    const res = await fetch(`${STYLEE_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const payload = await _errorBody(res);
      const error: ServiceErrorInfo = {
        kind: 'http',
        path,
        status: res.status,
        requestId: String(payload.request_id || res.headers?.get?.('X-Request-ID') || requestId),
        message: String(payload.message || payload.error || `HTTP ${res.status}`),
        stage: typeof payload.stage === 'string' ? payload.stage : undefined,
        errorType: typeof payload.error_type === 'string' ? payload.error_type : undefined,
        serverDurationMs: typeof payload.duration_ms === 'number' ? payload.duration_ms : undefined,
        retryable: typeof payload.retryable === 'boolean' ? payload.retryable : undefined,
      };
      console.warn('[stylee] request failed', error);
      _fireUnavailable();
      return { data: null, error };
    }
    return { data: (await res.json()) as T };
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    const error: ServiceErrorInfo = {
      kind: isTimeout ? 'timeout' : 'network',
      path,
      requestId,
      message: isTimeout ? `客户端等待 ${timeoutMs}ms 后中止请求` : (e instanceof Error ? e.message : String(e)),
      stage: isTimeout ? 'client_timeout' : 'client_request',
      errorType: e instanceof Error ? e.name : typeof e,
      retryable: true,
    };
    console.warn('[stylee] request failed', error);
    _fireUnavailable();
    return { data: null, error };
  } finally { clearTimeout(timer); }
}

async function _postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  return (await _postJsonDetailed<T>(path, body, timeoutMs)).data;
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
  return (await serviceRecognizeDetailed(b64, mime)).data;
}

export async function serviceRecognizeDetailed(b64: string, mime: string): Promise<ServiceResult<RecognizeResp>> {
  return _postJsonDetailed<RecognizeResp>('/recognize', { image_b64: b64, mime }, 20000);
}

export async function serviceRecognizeMulti(b64: string, mime: string): Promise<RecognizeManyResp | null> {
  return (await serviceRecognizeMultiDetailed(b64, mime)).data;
}

export async function serviceRecognizeMultiDetailed(
  b64: string,
  mime: string,
): Promise<ServiceResult<RecognizeManyResp>> {
  return _postJsonDetailed<RecognizeManyResp>('/recognize-multi', { image_b64: b64, mime }, 60000);
}

export async function serviceStandardize(
  b64: string, mime: string, photoType: string, category: string,
  extras?: { color?: string; material?: string; description?: string },
): Promise<StandardizeResp | null> {
  // Backend performs image edit followed by visual verification. Its defaults are
  // 60s + 20s, so keep the client deadline above the complete server operation.
  return _postJson<StandardizeResp>('/standardize',
    { image_b64: b64, mime, photo_type: photoType, item: { category, ...extras } }, 90000);
}

export async function serviceRecommend(req: RecommendReq): Promise<RecommendResp | null> {
  // /recommend 走真实 LLM 生成搭配，实测 ~55s，给足余量避免误触发回落
  return _postJson<RecommendResp>('/recommend', req, 90000);
}

export async function serviceRecommendDetailed(req: RecommendReq): Promise<ServiceResult<RecommendResp>> {
  return _postJsonDetailed<RecommendResp>('/recommend', req, 90000);
}

export async function serviceFeature<T>(path: string, body: unknown, timeoutMs = 60000): Promise<T | null> {
  return _postJson<T>(path, body, timeoutMs);
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
