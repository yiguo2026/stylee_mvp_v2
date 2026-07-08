import { DASHSCOPE_API_KEY } from './secrets';
import { logAiUsage, detectFeature } from './aiUsage';

const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DASHSCOPE_NATIVE_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const QWEN_VL_MODEL = 'qwen3-vl-plus';
const QWEN_IMAGE_MODEL = 'qwen-image-2.0-pro';

export interface DashScopeMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | DashScopeContentBlock[];
}

export interface DashScopeContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface DashScopeOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

function isAvailable(): boolean {
  return DASHSCOPE_API_KEY.length > 0;
}

export async function qwenVisionChat(
  imageUri: string,
  prompt: string,
  options?: DashScopeOptions,
): Promise<string | null> {
  if (!isAvailable()) {
    console.warn('[DashScope] API Key not set, skipping vision call');
    return null;
  }

  const t0 = Date.now();
  const model = options?.model || QWEN_VL_MODEL;
  const feature = detectFeature(prompt);

  let imageUrl: string;
  if (imageUri.startsWith('data:')) {
    imageUrl = imageUri;
  } else if (imageUri.startsWith('http')) {
    imageUrl = imageUri;
  } else {
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1] || result;
          resolve(base64Data);
        };
        reader.readAsDataURL(blob);
      });
      const mime = blob.type || 'image/jpeg';
      imageUrl = `data:${mime};base64,${base64}`;
    } catch (e) {
      console.warn('[DashScope] Failed to read image file:', e);
      return null;
    }
  }

  const messages: DashScopeMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  try {
    const body: Record<string, unknown> = {
      model: options?.model || QWEN_VL_MODEL,
      messages,
      stream: false,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2048,
    };
    if (options?.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);

    const res = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn('[DashScope] Vision API error:', res.status, await res.text().catch(() => ''));
      logAiUsage({ provider: 'qwen', model, feature, callType: 'vision', durationMs: Date.now() - t0, ok: false });
      return null;
    }

    const data = await res.json();
    const u = data.usage ?? {};
    const content = data.choices?.[0]?.message?.content;
    const ok = typeof content === 'string' && !!content.trim();
    logAiUsage({
      provider: 'qwen', model, feature, callType: 'vision',
      promptTokens: u.prompt_tokens, cachedTokens: u.prompt_tokens_details?.cached_tokens,
      completionTokens: u.completion_tokens, requestId: data.id,
      durationMs: Date.now() - t0, ok,
    });
    if (!ok) return null;
    return content.trim();
  } catch (e) {
    console.warn('[DashScope] Vision request failed:', e);
    logAiUsage({ provider: 'qwen', model, feature, callType: 'vision', durationMs: Date.now() - t0, ok: false });
    return null;
  }
}

/**
 * qwen-image-2.0-pro must use DashScope's native MultiModalConversation endpoint,
 * NOT the OpenAI-compatible-mode endpoint (which returns empty content).
 *
 * Native endpoint: POST /api/v1/services/aigc/multimodal-generation/generation
 * Response: output.choices[0].message.content[0].image = "https://..."
 */
export async function qwenGenerateImage(
  prompt: string,
  options?: { size?: string; imageUrl?: string; refImage?: string },
): Promise<string | null> {
  if (!isAvailable()) {
    console.warn('[DashScope] API Key not set, skipping image generation');
    return null;
  }

  const t0 = Date.now();
  const feature = detectFeature(prompt);

  try {
    // Build content parts: optional reference image + text prompt
    const contentParts: { image?: string; text?: string }[] = [];

    if (options?.refImage) {
      // Convert local/file URI to base64 data URL if needed
      let refUrl = options.refImage;
      if (!refUrl.startsWith('data:') && !refUrl.startsWith('http')) {
        try {
          const response = await fetch(refUrl);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result);
            };
            reader.readAsDataURL(blob);
          });
          refUrl = base64;
        } catch (e) {
          console.warn('[DashScope] Failed to read ref image:', e);
        }
      }
      if (refUrl.startsWith('data:') || refUrl.startsWith('http')) {
        contentParts.push({ image: refUrl });
      }
    }

    contentParts.push({ text: prompt });

    const body = {
      model: QWEN_IMAGE_MODEL,
      input: {
        messages: [
          {
            role: 'user',
            content: contentParts,
          },
        ],
      },
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);

    const res = await fetch(DASHSCOPE_NATIVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn('[DashScope] Image gen error:', res.status, await res.text().catch(() => ''));
      logAiUsage({ provider: 'qwen', model: QWEN_IMAGE_MODEL, feature, callType: 'image', durationMs: Date.now() - t0, ok: false });
      return null;
    }

    const data = await res.json();
    const imageCount = data.usage?.image_count ?? undefined;

    // Native format: output.choices[0].message.content[0].image
    const content = data.output?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (typeof item === 'object' && item.image && typeof item.image === 'string') {
          logAiUsage({ provider: 'qwen', model: QWEN_IMAGE_MODEL, feature, callType: 'image', imageCount: imageCount ?? 1, requestId: data.request_id, durationMs: Date.now() - t0, ok: true });
          return item.image;
        }
      }
    }

    console.warn('[DashScope] Image gen: unexpected response', JSON.stringify(data).slice(0, 300));
    logAiUsage({ provider: 'qwen', model: QWEN_IMAGE_MODEL, feature, callType: 'image', imageCount, requestId: data.request_id, durationMs: Date.now() - t0, ok: false });
    return null;
  } catch (e) {
    console.warn('[DashScope] Image gen failed:', e);
    logAiUsage({ provider: 'qwen', model: QWEN_IMAGE_MODEL, feature, callType: 'image', durationMs: Date.now() - t0, ok: false });
    return null;
  }
}

export { isAvailable };
