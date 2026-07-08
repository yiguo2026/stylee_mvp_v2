import { DEEPSEEK_KEY, DEEPSEEK_HOST } from './secrets';
import { logAiUsage, detectFeature } from './aiUsage';

const DEEPSEEK_URL = `https://${DEEPSEEK_HOST}/chat/completions`;

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export async function deepseekChat(
  messages: DeepSeekMessage[],
  options: DeepSeekOptions = {},
): Promise<string | null> {
  if (!DEEPSEEK_KEY) return null;

  const t0 = Date.now();
  const model = options.model ?? 'deepseek-v4-flash';
  const feature = detectFeature(messages.find(m => m.role === 'system')?.content ?? messages[0]?.content ?? '');

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      temperature: options.temperature ?? 1,
      max_tokens: options.maxTokens ?? 2048,
    };
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('[DeepSeek] API error:', res.status, await res.text().catch(() => ''));
      logAiUsage({ provider: 'deepseek', model, feature, callType: 'chat', durationMs: Date.now() - t0, ok: false });
      return null;
    }

    const data = await res.json();
    const u = data.usage ?? {};
    const content = data.choices?.[0]?.message?.content;
    const ok = typeof content === 'string' && !!content.trim();
    logAiUsage({
      provider: 'deepseek', model, feature, callType: 'chat',
      promptTokens: u.prompt_tokens,
      cachedTokens: u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens,
      completionTokens: u.completion_tokens,
      reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
      requestId: data.id, durationMs: Date.now() - t0, ok,
    });
    if (!ok) return null;
    return content.trim();
  } catch (e) {
    console.warn('[DeepSeek] request failed:', e);
    logAiUsage({ provider: 'deepseek', model, feature, callType: 'chat', durationMs: Date.now() - t0, ok: false });
    return null;
  }
}
