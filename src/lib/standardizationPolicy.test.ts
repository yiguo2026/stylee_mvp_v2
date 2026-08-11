import assert from 'node:assert';
import { test } from 'node:test';

import { acceptTransparentStandardization, buildStandardizationMetadata } from './standardizationPolicy.ts';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const valid = {
  image_ref: png,
  method: 'cutout_alpha',
  verified: true,
  mime: 'image/png',
  background: 'transparent',
  alpha_verified: true,
  matte_provider: 'pillow-border-connected-v1',
  failure_stage: null,
};

test('accepts only verified transparent PNG data URIs', () => {
  assert.equal(acceptTransparentStandardization(valid).ok, true);
  assert.equal(acceptTransparentStandardization({ ...valid, verified: false }).ok, false);
  assert.equal(acceptTransparentStandardization({ ...valid, alpha_verified: false }).ok, false);
  assert.equal(acceptTransparentStandardization({ ...valid, background: 'white' }).ok, false);
  assert.equal(acceptTransparentStandardization({ ...valid, mime: 'image/jpeg' }).ok, false);
  assert.equal(acceptTransparentStandardization({ ...valid, image_ref: 'https://provider/x.png' }).ok, false);
});

test('requires boolean verification flags from untyped service JSON', () => {
  assert.equal(
    acceptTransparentStandardization({ ...valid, verified: 'true' } as unknown as typeof valid).ok,
    false,
  );
  assert.equal(
    acceptTransparentStandardization({ ...valid, alpha_verified: 1 } as unknown as typeof valid).ok,
    false,
  );
});

test('rejects malformed and oversized PNG data URIs', () => {
  assert.equal(acceptTransparentStandardization({ ...valid, image_ref: 'data:image/png;base64,***' }).ok, false);
  const prefix = 'data:image/png;base64,';
  const atLimit = prefix + 'A'.repeat(12 * 1024 * 1024 - prefix.length);
  const oversized = `${atLimit}A`;
  assert.equal(acceptTransparentStandardization({ ...valid, image_ref: atLimit }).ok, true);
  assert.equal(acceptTransparentStandardization({ ...valid, image_ref: oversized }).ok, false);
});

test('metadata never contains PNG bytes', () => {
  const metadata = buildStandardizationMetadata(
    acceptTransparentStandardization(valid),
    'https://storage/original.jpg',
    'flatlay',
  );
  assert.equal(metadata.standardization_ok, true);
  assert.equal(metadata.transparent_background, true);
  assert.equal(JSON.stringify(metadata).includes('iVBOR'), false);
  assert.equal('image_ref' in metadata, false);
});

test('success metadata normalizes a missing matte provider to null', () => {
  const metadata = buildStandardizationMetadata(
    acceptTransparentStandardization({
      image_ref: png,
      method: 'cutout_alpha',
      verified: true,
      mime: 'image/png',
      background: 'transparent',
      alpha_verified: true,
      failure_stage: null,
    }),
    'https://storage/original.jpg',
    'flatlay',
  );
  assert.equal(metadata.standardization_ok, true);
  assert.equal(metadata.matte_provider, null);
  assert.equal(JSON.stringify(metadata).includes('"matte_provider":null'), true);
});

test('rejected responses produce JSONB-safe fallback metadata', () => {
  const metadata = buildStandardizationMetadata(
    acceptTransparentStandardization({ ...valid, alpha_verified: false }),
    'https://storage/original.jpg',
    'flatlay',
  );
  assert.deepEqual(metadata, {
    standardization_ok: false,
    standardization: 'fallback_original',
    verified: false,
    alpha_verified: false,
    transparent_background: false,
    matte_provider: null,
    failure_stage: 'unverified',
    original_uri: 'https://storage/original.jpg',
    photo_type: 'flatlay',
  });
  assert.equal(JSON.stringify(metadata).includes('iVBOR'), false);
});
