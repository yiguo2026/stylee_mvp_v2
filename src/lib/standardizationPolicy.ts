import type { StandardizeResp } from './styleeMapping.ts';
import { normalizePhotoType } from './styleeMapping.ts';

export const MAX_STANDARDIZED_DATA_URI_LENGTH = 12 * 1024 * 1024;

const PNG_DATA_URI_PREFIX = 'data:image/png;base64,';
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PNG_SIGNATURE_BASE64_PREFIX = 'iVBORw0KGg';
const PNG_SIGNATURE_FINAL_SEXTETS = 'opqr';

export type TransparentAcceptance =
  | { ok: true; uri: string; response: StandardizeResp }
  | {
      ok: false;
      reason: 'missing' | 'unverified' | 'not_transparent' | 'not_png' | 'malformed' | 'oversize';
      response?: StandardizeResp;
    };

export interface StandardizationDiagnostics {
  requestId?: unknown;
  failedStage?: unknown;
}

export interface StandardizationMetadata {
  standardization_ok: boolean;
  standardization: string;
  verified: boolean;
  alpha_verified: boolean;
  transparent_background: boolean;
  matte_provider: string | null;
  request_id?: string;
  failure_stage?: string;
  original_uri: string;
  photo_type: string;
}

function sanitizedDiagnosticValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : undefined;
}

function isCanonicalPngDataUri(value: string): boolean {
  if (!value.startsWith(PNG_DATA_URI_PREFIX)) return false;

  const payload = value.slice(PNG_DATA_URI_PREFIX.length);
  if (payload.length % 4 !== 0 || !BASE64_PAYLOAD.test(payload)) return false;
  if (
    !payload.startsWith(PNG_SIGNATURE_BASE64_PREFIX)
    || !PNG_SIGNATURE_FINAL_SEXTETS.includes(payload.charAt(PNG_SIGNATURE_BASE64_PREFIX.length))
  ) {
    return false;
  }

  const finalQuartet = payload.slice(-4);
  if (payload.endsWith('==')) {
    return (BASE64_ALPHABET.indexOf(finalQuartet.charAt(1)) & 0x0f) === 0;
  }
  if (payload.endsWith('=')) {
    return (BASE64_ALPHABET.indexOf(finalQuartet.charAt(2)) & 0x03) === 0;
  }
  return true;
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

  if (!isCanonicalPngDataUri(response.image_ref)) {
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
  diagnostics: StandardizationDiagnostics = {},
): StandardizationMetadata {
  const requestId = sanitizedDiagnosticValue(diagnostics.requestId);
  if (!acceptance.ok) {
    const failureStage = sanitizedDiagnosticValue(acceptance.response?.failure_stage)
      ?? sanitizedDiagnosticValue(diagnostics.failedStage)
      ?? acceptance.reason;
    return {
      standardization_ok: false,
      standardization: 'fallback_original',
      verified: false,
      alpha_verified: false,
      transparent_background: false,
      matte_provider: null,
      ...(requestId ? { request_id: requestId } : {}),
      failure_stage: failureStage,
      original_uri: originalUri,
      photo_type: normalizePhotoType(photoType),
    };
  }

  return {
    standardization_ok: true,
    standardization: acceptance.response.method,
    verified: acceptance.response.verified,
    alpha_verified: acceptance.response.alpha_verified === true,
    transparent_background: acceptance.response.background === 'transparent',
    matte_provider: acceptance.response.matte_provider ?? null,
    ...(requestId ? { request_id: requestId } : {}),
    original_uri: originalUri,
    photo_type: normalizePhotoType(photoType),
  };
}
