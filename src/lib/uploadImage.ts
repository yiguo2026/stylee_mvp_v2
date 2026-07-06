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

/**
 * Upload a local image URI to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 *
 * - Remote URLs (http/https) are returned as-is (no re-upload needed).
 * - Local URIs (blob:, data:, file:) are uploaded to Supabase Storage.
 * - Has a 15s timeout to prevent hanging on network issues.
 */
export const uploadWardrobeImage = async (
  localUri: string,
  userId: string,
  subfolder?: string,
): Promise<string | null> => {
  // Remote URL — already publicly accessible, no need to re-upload
  if (isRemoteUrl(localUri)) {
    return localUri;
  }

  try {
    let ext = 'jpg';
    if (localUri.startsWith('blob:') || localUri.startsWith('data:')) {
      ext = 'jpg';
    } else {
      const parsed = localUri.split('.').pop()?.toLowerCase();
      if (parsed && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(parsed)) {
        ext = parsed === 'jpeg' ? 'jpg' : parsed;
      }
    }
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const folder = subfolder ? `${userId}/${subfolder}` : userId;
    const fileName = `${folder}/${Date.now()}.${ext}`;

    const response = await withTimeout(fetch(localUri), 15000);
    if (!response) {
      console.warn('[uploadImage] fetch timed out for', localUri.slice(0, 60));
      return null;
    }
    const blob = await response.blob();

    const uploadResult = await withTimeout(
      supabase.storage
        .from(BUCKET)
        .upload(fileName, blob, { contentType, upsert: false }),
      15000,
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
