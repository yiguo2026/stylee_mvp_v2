import { supabase } from './supabase';

const BUCKET = 'wardrobe-images';

function isRemoteUrl(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ]);
}

export interface UploadImageOptions {
  /** Copy remote provider URLs into our own bucket instead of storing expiring URLs. */
  persistRemote?: boolean;
  timeoutMs?: number;
}

function extensionFor(uri: string, mime: string): string {
  const mimeExt = mime.toLowerCase().split('/')[1]?.split(';')[0];
  if (mimeExt && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(mimeExt)) {
    return mimeExt === 'jpeg' ? 'jpg' : mimeExt;
  }
  const cleanUri = uri.split(/[?#]/, 1)[0];
  const parsed = cleanUri.split('.').pop()?.toLowerCase();
  if (parsed && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(parsed)) {
    return parsed === 'jpeg' ? 'jpg' : parsed;
  }
  return 'jpg';
}

/**
 * Upload a local image URI to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 *
 * - Remote URLs are returned as-is unless persistRemote is enabled. Provider
 *   output (for example Qwen OSS URLs) must enable it because those URLs expire.
 * - Local URIs (blob:, data:, file:) are uploaded to Supabase Storage.
 * - Has a 15s timeout to prevent hanging on network issues.
 */
export const uploadWardrobeImage = async (
  localUri: string,
  userId: string,
  subfolder?: string,
  options: UploadImageOptions = {},
): Promise<string | null> => {
  if (isRemoteUrl(localUri) && !options.persistRemote) {
    return localUri;
  }

  try {
    const timeoutMs = options.timeoutMs ?? (options.persistRemote ? 30000 : 15000);
    const response = await withTimeout(fetch(localUri), timeoutMs);
    // React Native file:// responses may use status 0 even when the blob is
    // readable. Enforce HTTP status only for remote provider downloads.
    if (!response || (isRemoteUrl(localUri) && !response.ok)) {
      console.warn('[uploadImage] fetch failed for', localUri.slice(0, 60), response?.status);
      return null;
    }
    const blob = await response.blob();
    const ext = extensionFor(localUri, blob.type || '');
    const contentType = blob.type || (ext === 'png' ? 'image/png' : 'image/jpeg');
    const folder = subfolder ? `${userId}/${subfolder}` : userId;
    const fileName = `${folder}/${Date.now()}.${ext}`;

    const uploadResult = await withTimeout(
      supabase.storage
        .from(BUCKET)
        .upload(fileName, blob, { contentType, upsert: false }),
      timeoutMs,
    );

    if (!uploadResult) {
      console.warn('[uploadImage] Storage upload timed out');
      return null;
    }

    const { data, error } = uploadResult;
    if (error || !data) {
      console.warn('[uploadImage] Storage upload failed:', error?.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
    return urlData.publicUrl;
  } catch (e) {
    console.warn('[uploadImage] Unexpected error:', e);
    return null;
  }
};
