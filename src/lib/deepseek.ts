const DEEPSEEK_KEY = process.env.EXPO_PUBLIC_DEEPSEEK_KEY ?? '';
const DEEPSEEK_HOST = process.env.EXPO_PUBLIC_DEEPSEEK_HOST ?? 'api.deepseek.com';
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

  try {
    const body: Record<string, unknown> = {
      model: options.model ?? 'deepseek-v4-flash',
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
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;
    return content.trim();
  } catch (e) {
    console.warn('[DeepSeek] request failed:', e);
    return null;
  }
}
