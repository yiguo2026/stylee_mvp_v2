import { supabase } from './supabase';

const BUCKET = 'wardrobe-images';

/**
 * Upload a local image URI to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 *
 * Falls back gracefully: if the bucket doesn't exist or upload fails,
 * the caller can keep using the local URI for on-device display.
 *
 * Bucket setup (do once in Supabase dashboard):
 *   Storage → New bucket → Name: "wardrobe-images" → Public: ON
 *   Then add this RLS policy on storage.objects:
 *     CREATE POLICY "Users manage own images" ON storage.objects
 *     FOR ALL USING (bucket_id = 'wardrobe-images' AND auth.uid()::text = (storage.foldername(name))[1]);
 */
export const uploadWardrobeImage = async (
  localUri: string,
  userId: string,
  subfolder?: string,
): Promise<string | null> => {
  try {
    // Extract extension: handle blob URLs (web) and file URIs (native)
    let ext = 'jpg';
    if (localUri.startsWith('blob:') || localUri.startsWith('data:')) {
      // Web: no file extension in blob/data URIs; default to jpg
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

    // Use fetch to read the local file URI as a blob (works in React Native)
    const response = await fetch(localUri);
    const blob = await response.blob();

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, blob, { contentType, upsert: false });

    if (error) {
      console.warn('[uploadImage] Storage upload failed:', error.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
    return urlData.publicUrl;
  } catch (e) {
    console.warn('[uploadImage] Unexpected error:', e);
    return null;
  }
};
