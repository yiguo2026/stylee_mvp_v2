import { DASHSCOPE_API_KEY } from './secrets';

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
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;
    return content.trim();
  } catch (e) {
    console.warn('[DashScope] Vision request failed:', e);
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
  options?: { size?: string; imageUrl?: string },
): Promise<string | null> {
  if (!isAvailable()) {
    console.warn('[DashScope] API Key not set, skipping image generation');
    return null;
  }

  try {
    const contentParts: { text: string }[] = [
      { text: prompt },
    ];

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
      return null;
    }

    const data = await res.json();

    // Native format: output.choices[0].message.content[0].image
    const content = data.output?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (typeof item === 'object' && item.image && typeof item.image === 'string') {
          return item.image;
        }
      }
    }

    console.warn('[DashScope] Image gen: unexpected response', JSON.stringify(data).slice(0, 300));
    return null;
  } catch (e) {
    console.warn('[DashScope] Image gen failed:', e);
    return null;
  }
}

export { isAvailable };
