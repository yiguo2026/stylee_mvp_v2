const ARK_API_KEY = process.env.EXPO_PUBLIC_ARK_API_KEY ?? 'ark-437e1a36-ea95-44dd-9f95-4a9091c0b287-d6c81';
const ARK_ENDPOINT_ID = process.env.EXPO_PUBLIC_ARK_ENDPOINT_ID ?? '';
const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

export interface ArkMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ArkContentBlock[];
}

export interface ArkContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ArkOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

function isAvailable(): boolean {
  return ARK_API_KEY.length > 0;
}

export async function arkChat(
  messages: ArkMessage[],
  options: ArkOptions = {},
): Promise<string | null> {
  if (!isAvailable()) {
    console.warn('[Ark] API Key not set, skipping multimodal call');
    return null;
  }

  try {
    const body: Record<string, unknown> = {
      // model 填 endpoint_id（推理接入点ID），不是模型名
      model: options.model || ARK_ENDPOINT_ID,
      messages,
      stream: false,
      temperature: options.temperature ?? 0.5,
      max_tokens: options.maxTokens ?? 2048,
    };
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(`${ARK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('[Ark] API error:', res.status, await res.text().catch(() => ''));
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return null;
    return content.trim();
  } catch (e) {
    console.warn('[Ark] request failed:', e);
    return null;
  }
}

export async function arkVision(
  imageUri: string,
  prompt: string,
  options?: ArkOptions,
): Promise<string | null> {
  let imageUrl: string;

  if (imageUri.startsWith('data:')) {
    imageUrl = imageUri;
  } else if (imageUri.startsWith('http')) {
    imageUrl = imageUri;
  } else {
    // Local file — read as base64 using fetch (works on web and native)
    try {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Remove data:mime;base64, prefix for clean base64
          const base64Data = result.split(',')[1] || result;
          resolve(base64Data);
        };
        reader.readAsDataURL(blob);
      });
      const mime = blob.type || 'image/jpeg';
      imageUrl = `data:${mime};base64,${base64}`;
    } catch (e) {
      console.warn('[Ark] Failed to read image file:', e);
      return null;
    }
  }

  const messages: ArkMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  return arkChat(messages, options);
}

export { isAvailable };
