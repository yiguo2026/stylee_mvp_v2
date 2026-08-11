import type { StandardizeResp } from './styleeMapping.ts';

export const MAX_STANDARDIZED_DATA_URI_LENGTH = 12 * 1024 * 1024;

const PNG_DATA_URI = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

export type TransparentAcceptance =
  | { ok: true; uri: string; response: StandardizeResp }
  | {
      ok: false;
      reason: 'missing' | 'unverified' | 'not_transparent' | 'not_png' | 'malformed' | 'oversize';
      response?: StandardizeResp;
    };

export interface StandardizationMetadata {
  standardization_ok: boolean;
  standardization: string;
  verified: boolean;
  alpha_verified: boolean;
  transparent_background: boolean;
  matte_provider: string | null;
  failure_stage?: string;
  original_uri: string;
  photo_type: string;
}

/**
 * Allows standardized images into the app only when the service's transparent
 * PNG contract is fully verified. This function is deliberately pure so its
 * decision can be persisted without exposing the returned image bytes.
 */
export function acceptTransparentStandardization(response?: StandardizeResp): TransparentAcceptance {
  if (!response || !response.image_ref) {
    return { ok: false, reason: 'missing', response };
  }

  if (response.verified !== true || response.alpha_verified !== true) {
    return { ok: false, reason: 'unverified', response };
  }

  if (response.background !== 'transparent') {
    return { ok: false, reason: 'not_transparent', response };
  }

  if (response.mime !== 'image/png') {
    return { ok: false, reason: 'not_png', response };
  }

  if (response.image_ref.length > MAX_STANDARDIZED_DATA_URI_LENGTH) {
    return { ok: false, reason: 'oversize', response };
  }

  if (!PNG_DATA_URI.test(response.image_ref)) {
    return { ok: false, reason: 'malformed', response };
  }

  return { ok: true, uri: response.image_ref, response };
}

/**
 * Produces a persistence-safe subset of the standardization result. In
 * particular, `image_ref` is never included because it can be a PNG data URI.
 */
export function buildStandardizationMetadata(
  acceptance: TransparentAcceptance,
  originalUri: string,
  photoType: string,
): StandardizationMetadata {
  if (!acceptance.ok) {
    return {
      standardization_ok: false,
      standardization: 'fallback_original',
      verified: false,
      alpha_verified: false,
      transparent_background: false,
      matte_provider: null,
      failure_stage: acceptance.response?.failure_stage || acceptance.reason,
      original_uri: originalUri,
      photo_type: photoType,
    };
  }

  return {
    standardization_ok: true,
    standardization: acceptance.response.method,
    verified: acceptance.response.verified,
    alpha_verified: acceptance.response.alpha_verified === true,
    transparent_background: acceptance.response.background === 'transparent',
    matte_provider: acceptance.response.matte_provider ?? null,
    original_uri: originalUri,
    photo_type: photoType,
  };
}
