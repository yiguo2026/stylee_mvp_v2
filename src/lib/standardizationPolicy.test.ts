import assert from 'node:assert';
import { test } from 'node:test';

import {
  MAX_STANDARDIZED_DATA_URI_LENGTH,
  acceptTransparentStandardization,
  buildStandardizationMetadata,
} from './standardizationPolicy.ts';

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
  const signaturePrefix = 'iVBORw0KGgo';
  const maximumPayloadLength = MAX_STANDARDIZED_DATA_URI_LENGTH - prefix.length;
  const canonicalPayloadLength = maximumPayloadLength - (maximumPayloadLength % 4);
  const atLimit = prefix + signaturePrefix + 'A'.repeat(canonicalPayloadLength - signaturePrefix.length);
  const oversized = `${atLimit}AAAA`;
  assert.equal(acceptTransparentStandardization({ ...valid, image_ref: atLimit }).ok, true);
  assert.equal(acceptTransparentStandardization({ ...valid, image_ref: oversized }).ok, false);
});

test('rejects a canonical base64 payload without the PNG signature', () => {
  const acceptance = acceptTransparentStandardization({
    ...valid,
    image_ref: 'data:image/png;base64,AAAA',
  });

  assert.equal(acceptance.ok, false);
  assert.equal(acceptance.ok ? undefined : acceptance.reason, 'malformed');
});

test('rejects non-canonical base64 length and padding', () => {
  const malformedRefs = [
    'data:image/png;base64,iVBORw0KGgo',
    'data:image/png;base64,iVBORw0KGgo===',
    'data:image/png;base64,iVBORw0KGgoAAB==',
    'data:image/png;base64,iVBORw0KGgoAAAB=',
  ];

  for (const image_ref of malformedRefs) {
    const acceptance = acceptTransparentStandardization({ ...valid, image_ref });
    assert.equal(acceptance.ok, false);
    assert.equal(acceptance.ok ? undefined : acceptance.reason, 'malformed');
  }
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

test('success metadata preserves only valid visible bounds', () => {
  const acceptance = acceptTransparentStandardization({
    ...valid,
    visible_bounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.6 },
  });
  assert.deepEqual(
    buildStandardizationMetadata(acceptance, 'https://storage/original.jpg', 'flatlay').visible_bounds,
    { left: 0.1, top: 0.2, width: 0.5, height: 0.6 },
  );
});

test('invalid bounds do not reject an otherwise valid transparent PNG', () => {
  const acceptance = acceptTransparentStandardization({
    ...valid,
    visible_bounds: { left: 0.9, top: 0, width: 0.2, height: 1 },
  });
  assert.equal(acceptance.ok, true);
  assert.equal(
    buildStandardizationMetadata(acceptance, 'https://storage/original.jpg', 'flatlay').visible_bounds,
    undefined,
  );
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
