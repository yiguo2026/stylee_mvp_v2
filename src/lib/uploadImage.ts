import { storageFormatFor } from './imageUploadPolicy.ts';
import { buildStandardizationMetadata } from './standardizationPolicy.ts';
import type {
  StandardizationDiagnostics,
  StandardizationMetadata,
  TransparentAcceptance,
} from './standardizationPolicy.ts';

const BUCKET = 'wardrobe-images';

type UploadFailureKind =
  | 'fetch_exception'
  | 'fetch_response'
  | 'fetch_timeout'
  | 'blob_exception'
  | 'storage_init_exception'
  | 'storage_exception'
  | 'storage_response'
  | 'storage_timeout';

function uriKindForLog(uri: string): 'http' | 'https' | 'data' | 'file' | 'blob' | 'unknown' {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1]?.toLowerCase();
  if (scheme === 'http' || scheme === 'https' || scheme === 'data'
      || scheme === 'file' || scheme === 'blob') {
    return scheme;
  }
  return 'unknown';
}

function safeErrorName(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('name' in error)) return undefined;
  const name = String((error as { name?: unknown }).name ?? '');
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : undefined;
}

function logUploadFailure(
  uri: string,
  errorKind: UploadFailureKind,
  options: { httpStatus?: number; error?: unknown } = {},
): void {
  const errorName = safeErrorName(options.error);
  console.warn('[uploadImage] operation failed', {
    uriKind: uriKindForLog(uri),
    uriChars: uri.length,
    ...(typeof options.httpStatus === 'number' ? { httpStatus: options.httpStatus } : {}),
    ...(errorName ? { errorName } : {}),
    errorKind,
  });
}

function isRemoteUrl(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface UploadImageOptions {
  /** Copy remote provider URLs into our own bucket instead of storing expiring URLs. */
  persistRemote?: boolean;
  timeoutMs?: number;
}

export type UploadWardrobeImage = (
  localUri: string,
  userId: string,
  subfolder?: string,
  options?: UploadImageOptions,
) => Promise<string | null>;

interface FetchImageResponse {
  ok: boolean;
  status: number;
  blob: () => Promise<Blob>;
}

interface WardrobeImageBucket {
  upload: (
    path: string,
    blob: Blob,
    options: { contentType: string; upsert: false },
  ) => Promise<{
    data: { path: string } | null;
    error: { message?: string } | null;
  }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
}

export interface WardrobeImageUploaderDependencies {
  fetchImage: (uri: string) => Promise<FetchImageResponse>;
  getBucket: () => Promise<WardrobeImageBucket>;
  now?: () => number;
}

/**
 * Builds an uploader around injectable fetch/storage boundaries. Production
 * uses the default Supabase adapter below; tests use the same persistence
 * behavior with a recording bucket.
 */
export function createWardrobeImageUploader(
  dependencies: WardrobeImageUploaderDependencies,
): UploadWardrobeImage {
  return async (localUri, userId, subfolder, options = {}) => {
    if (isRemoteUrl(localUri) && !options.persistRemote) {
      return localUri;
    }

    let exceptionKind: UploadFailureKind = 'fetch_exception';
    try {
      const timeoutMs = options.timeoutMs ?? (options.persistRemote ? 30000 : 15000);
      const response = await withTimeout(dependencies.fetchImage(localUri), timeoutMs);
      // React Native file:// responses may use status 0 even when the blob is
      // readable. Enforce HTTP status only for remote provider downloads.
      if (!response || (isRemoteUrl(localUri) && !response.ok)) {
        logUploadFailure(
          localUri,
          response ? 'fetch_response' : 'fetch_timeout',
          { httpStatus: response?.status },
        );
        return null;
      }
      exceptionKind = 'blob_exception';
      const blob = await response.blob();
      const { extension, contentType } = storageFormatFor(localUri, blob.type || '');
      const folder = subfolder ? `${userId}/${subfolder}` : userId;
      const fileName = `${folder}/${(dependencies.now ?? Date.now)()}.${extension}`;
      exceptionKind = 'storage_init_exception';
      const bucket = await dependencies.getBucket();

      exceptionKind = 'storage_exception';
      const uploadResult = await withTimeout(
        bucket.upload(fileName, blob, { contentType, upsert: false }),
        timeoutMs,
      );

      if (!uploadResult) {
        logUploadFailure(localUri, 'storage_timeout');
        return null;
      }

      const { data, error } = uploadResult;
      if (error || !data) {
        logUploadFailure(localUri, 'storage_response', { error });
        return null;
      }

      return bucket.getPublicUrl(data.path).data.publicUrl;
    } catch (error) {
      logUploadFailure(localUri, exceptionKind, { error });
      return null;
    }
  };
}

const defaultUploader = createWardrobeImageUploader({
  fetchImage: (uri) => fetch(uri),
  getBucket: async () => {
    const { supabase } = await import('./supabase');
    return supabase.storage.from(BUCKET) as unknown as WardrobeImageBucket;
  },
});

/**
 * Upload a local image URI to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 *
 * - Remote URLs are returned as-is unless persistRemote is enabled. Provider
 *   output must enable it because those URLs can expire.
 * - Local URIs (blob:, data:, file:) are uploaded to Supabase Storage.
 */
export const uploadWardrobeImage: UploadWardrobeImage = (...args) => defaultUploader(...args);

export interface PersistGarmentMasterInput {
  sourceUri: string;
  userId: string;
  photoType: string;
  acceptance: TransparentAcceptance;
  diagnostics?: StandardizationDiagnostics;
}

export type PersistedGarmentMetadata = StandardizationMetadata & {
  original_image_url: string;
  standardized_image_url: string | null;
};

export type PersistGarmentMasterResult =
  | { ok: false; reason: 'original_upload_failed' }
  | {
      ok: true;
      status: 'transparent_master' | 'fallback_original';
      imageUrl: string;
      metadata: PersistedGarmentMetadata;
    };

export function shouldPersistReplacementImage(
  selectedReplacementUri: string | null | undefined,
): selectedReplacementUri is string {
  return Boolean(selectedReplacementUri);
}

/**
 * Persists a source image before an accepted transparent master and returns
 * the JSONB-safe metadata that callers write with their wardrobe row.
 */
export async function persistGarmentMaster(
  input: PersistGarmentMasterInput,
  upload: UploadWardrobeImage = uploadWardrobeImage,
): Promise<PersistGarmentMasterResult> {
  const durableOriginalUrl = await upload(input.sourceUri, input.userId, 'originals', {
    persistRemote: true,
    timeoutMs: 45000,
  });
  if (!durableOriginalUrl) {
    return { ok: false, reason: 'original_upload_failed' };
  }

  let transparentMasterUrl: string | null = null;
  let persistedAcceptance: TransparentAcceptance = input.acceptance;
  if (persistedAcceptance.ok) {
    transparentMasterUrl = await upload(persistedAcceptance.uri, input.userId, undefined, {
      persistRemote: true,
      timeoutMs: 45000,
    });
    if (!transparentMasterUrl) {
      persistedAcceptance = {
        ok: false,
        reason: 'missing',
        response: { ...persistedAcceptance.response, failure_stage: 'transparent_upload' },
      };
    }
  }

  const metadata: PersistedGarmentMetadata = {
    ...buildStandardizationMetadata(
      persistedAcceptance,
      durableOriginalUrl,
      input.photoType,
      input.diagnostics,
    ),
    original_image_url: durableOriginalUrl,
    standardized_image_url: transparentMasterUrl,
  };

  return {
    ok: true,
    status: transparentMasterUrl ? 'transparent_master' : 'fallback_original',
    imageUrl: transparentMasterUrl ?? durableOriginalUrl,
    metadata,
  };
}
