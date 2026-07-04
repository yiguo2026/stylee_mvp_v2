import { supabase } from './supabase';
import { uploadWardrobeImage } from './uploadImage';

const BUCKET = 'wardrobe-images';

/**
 * Upload selfie image to Supabase Storage and save URL to user_body_models.
 * Returns the public URL on success, or null on failure.
 */
export async function saveSelfie(localUri: string, userId: string): Promise<string | null> {
  try {
    // Upload to storage
    const uploadedUrl = await uploadWardrobeImage(localUri, userId, 'selfie');
    if (!uploadedUrl) return null;

    // Upsert into user_body_models
    const { error } = await supabase
      .from('user_body_models')
      .upsert(
        {
          user_id: userId,
          selfie_url: uploadedUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) {
      console.warn('[bodyModel] upsert failed:', error.message);
      return null;
    }

    return uploadedUrl;
  } catch (e) {
    console.warn('[bodyModel] saveSelfie failed:', e);
    return null;
  }
}

/**
 * Load selfie URL from user_body_models.
 * Returns the URL string or null.
 */
export async function loadSelfie(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('user_body_models')
      .select('selfie_url')
      .eq('user_id', userId)
      .single();

    if (error || !data?.selfie_url) return null;
    return data.selfie_url;
  } catch {
    return null;
  }
}
