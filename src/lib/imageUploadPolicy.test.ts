import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storageFormatFor } from './imageUploadPolicy.ts';
import {
  createWardrobeImageUploader,
  persistGarmentMaster,
  shouldPersistReplacementImage,
  type UploadWardrobeImage,
} from './uploadImage.ts';

test('transparent data URI persists as PNG', () => {
  assert.deepEqual(storageFormatFor('data:image/png;base64,AAAA', 'image/png'), {
    extension: 'png', contentType: 'image/png',
  });
});

test('legacy JPEG behavior stays compatible', () => {
  assert.deepEqual(storageFormatFor('file:///photo.jpg', 'image/jpeg'), {
    extension: 'jpg', contentType: 'image/jpeg',
  });
});

test('storage format policy covers supported MIME and path fallbacks', () => {
  const cases = [
    {
      name: 'MIME wins over path extension',
      uri: 'file:///photo.jpg',
      mime: 'image/png',
      want: { extension: 'png', contentType: 'image/png' },
    },
    {
      name: 'jpeg MIME normalizes to jpg',
      uri: 'file:///photo.png',
      mime: 'image/jpeg',
      want: { extension: 'jpg', contentType: 'image/jpeg' },
    },
    {
      name: 'gif MIME stays gif',
      uri: 'file:///photo',
      mime: 'image/gif',
      want: { extension: 'gif', contentType: 'image/gif' },
    },
    {
      name: 'webp MIME stays webp',
      uri: 'file:///photo',
      mime: 'image/webp',
      want: { extension: 'webp', contentType: 'image/webp' },
    },
    {
      name: 'bmp MIME stays bmp',
      uri: 'file:///photo',
      mime: 'image/bmp',
      want: { extension: 'bmp', contentType: 'image/bmp' },
    },
    {
      name: 'path extension is used when MIME is unavailable',
      uri: 'file:///photo.PNG',
      mime: '',
      want: { extension: 'png', contentType: 'image/png' },
    },
    {
      name: 'query and fragment are removed before jpeg path normalization',
      uri: 'https://provider/photo.jpeg?token=secret#preview',
      mime: '',
      want: { extension: 'jpg', contentType: 'image/jpeg' },
    },
    {
      name: 'unsupported format defaults to JPEG',
      uri: 'file:///photo.heic',
      mime: 'image/heic',
      want: { extension: 'jpg', contentType: 'image/jpeg' },
    },
  ] as const;

  for (const fixture of cases) {
    assert.deepEqual(storageFormatFor(fixture.uri, fixture.mime), fixture.want, fixture.name);
  }
});

function uploaderHarness() {
  const fetchUris: string[] = [];
  const uploadCalls: Array<{
    path: string;
    contentType?: string;
    upsert?: boolean;
    blobType: string;
  }> = [];
  const uploader = createWardrobeImageUploader({
    fetchImage: async (uri) => {
      fetchUris.push(uri);
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
      };
    },
    getBucket: async () => ({
      upload: async (path, blob, options) => {
        uploadCalls.push({ path, contentType: options.contentType, upsert: options.upsert, blobType: blob.type });
        return { data: { path }, error: null };
      },
      getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
    }),
    now: () => 1234,
  });
  return { uploader, fetchUris, uploadCalls };
}

async function captureUploadWarnings(run: () => Promise<void>) {
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    await run();
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(console.warn, originalWarn);
  return warnings;
}

function capturedWarningText(warnings: unknown[][]): string {
  return warnings.flatMap((args) => args.map((value) => {
    if (value instanceof Error) {
      return [value.name, value.message, value.stack, String(value.cause ?? '')].join('|');
    }
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value);
  })).join('\n');
}

test('remote HTTP image is passed through when persistence is not requested', async () => {
  const harness = uploaderHarness();
  const providerUrl = 'https://provider.test/temporary.png';

  const result = await harness.uploader(providerUrl, 'user-1');

  assert.equal(result, providerUrl);
  assert.deepEqual(harness.fetchUris, []);
  assert.deepEqual(harness.uploadCalls, []);
});

test('remote HTTP image is copied to Supabase with policy content type when persistence is requested', async () => {
  const harness = uploaderHarness();

  const result = await harness.uploader(
    'https://provider.test/temporary.jpg?token=secret',
    'user-1',
    'originals',
    { persistRemote: true },
  );

  assert.equal(result, 'https://storage.test/user-1/originals/1234.png');
  assert.deepEqual(harness.fetchUris, ['https://provider.test/temporary.jpg?token=secret']);
  assert.deepEqual(harness.uploadCalls, [{
    path: 'user-1/originals/1234.png',
    contentType: 'image/png',
    upsert: false,
    blobType: 'image/png',
  }]);
});

test('fetch exceptions log only allowlisted diagnostics and restore console.warn', async () => {
  const imageMarker = ['image', 'bytes', 'marker'].join('-');
  const keyMarker = ['api', 'key', 'marker'].join('-');
  const sensitiveUri = `data:image/png;base64,${imageMarker}`;
  const uploader = createWardrobeImageUploader({
    fetchImage: async () => {
      throw {
        name: 'FetchBoundaryError',
        message: keyMarker,
        stack: sensitiveUri,
        cause: { providerPayload: sensitiveUri },
      };
    },
    getBucket: async () => { throw new Error('unused'); },
  });

  const warnings = await captureUploadWarnings(async () => {
    assert.equal(await uploader(sensitiveUri, 'user-1'), null);
  });
  const warningText = capturedWarningText(warnings);
  assert.equal(warnings.length, 1);
  assert.equal(warningText.includes(imageMarker), false);
  assert.equal(warningText.includes(keyMarker), false);
  assert.equal((warnings[0][1] as any)?.uriKind, 'data');
  assert.equal((warnings[0][1] as any)?.uriChars, sensitiveUri.length);
  assert.equal((warnings[0][1] as any)?.errorName, 'FetchBoundaryError');
});

test('storage failures never log response messages, image refs, or raw errors', async () => {
  const imageMarker = ['upload', 'image', 'marker'].join('-');
  const keyMarker = ['storage', 'key', 'marker'].join('-');
  const sensitiveUri = `data:image/png;base64,${imageMarker}`;
  const uploader = createWardrobeImageUploader({
    fetchImage: async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob(['png'], { type: 'image/png' }),
    }),
    getBucket: async () => ({
      upload: async () => ({
        data: null,
        error: { message: keyMarker, stack: sensitiveUri },
      } as any),
      getPublicUrl: (path) => ({ data: { publicUrl: path } }),
    }),
  });

  const warnings = await captureUploadWarnings(async () => {
    assert.equal(await uploader(sensitiveUri, 'user-1'), null);
  });
  const warningText = capturedWarningText(warnings);
  assert.equal(warnings.length, 1);
  assert.equal(warningText.includes(imageMarker), false);
  assert.equal(warningText.includes(keyMarker), false);
  assert.equal((warnings[0][1] as any)?.uriKind, 'data');
  assert.equal((warnings[0][1] as any)?.uriChars, sensitiveUri.length);
  assert.equal((warnings[0][1] as any)?.errorKind, 'storage_response');
});

test('HTTP fetch rejection logs kind, length, and status without the URI', async () => {
  const pathMarker = ['private', 'path', 'marker'].join('-');
  const remoteUri = `https://provider.test/${pathMarker}`;
  const uploader = createWardrobeImageUploader({
    fetchImage: async () => ({
      ok: false,
      status: 502,
      blob: async () => new Blob(),
    }),
    getBucket: async () => { throw new Error('unused'); },
  });

  const warnings = await captureUploadWarnings(async () => {
    assert.equal(await uploader(remoteUri, 'user-1', undefined, { persistRemote: true }), null);
  });
  const warningText = capturedWarningText(warnings);
  assert.equal(warningText.includes(pathMarker), false);
  assert.equal((warnings[0][1] as any)?.uriKind, 'https');
  assert.equal((warnings[0][1] as any)?.uriChars, remoteUri.length);
  assert.equal((warnings[0][1] as any)?.httpStatus, 502);
});

const accepted = {
  ok: true as const,
  uri: 'data:image/png;base64,AAAA',
  response: {
    image_ref: 'data:image/png;base64,AAAA',
    method: 'cutout_alpha',
    verified: true,
    mime: 'image/png',
    background: 'transparent',
    alpha_verified: true,
    matte_provider: 'matte-v1',
    failure_stage: null,
    visible_bounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.6 },
  },
};

function recordingUploader(results: Array<string | null>) {
  const calls: Array<{
    uri: string;
    userId: string;
    subfolder?: string;
    persistRemote?: boolean;
  }> = [];
  const upload: UploadWardrobeImage = async (uri, userId, subfolder, options = {}) => {
    calls.push({ uri, userId, subfolder, persistRemote: options.persistRemote });
    return results.shift() ?? null;
  };
  return { upload, calls };
}

function assertMetadataHasNoDiagnosticPayload(
  metadata: object,
  sensitiveMarkers: string[],
) {
  const serialized = JSON.stringify(metadata);
  for (const marker of sensitiveMarkers) {
    assert.equal(serialized.includes(marker), false);
  }
  for (const forbiddenKey of ['image_ref', 'message', 'stack', 'cause', 'provider_payload', 'trace']) {
    assert.equal(Object.prototype.hasOwnProperty.call(metadata, forbiddenKey), false);
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('master upload waits until the durable original promise resolves', async () => {
  const original = deferred<string | null>();
  const calls: string[] = [];
  const upload: UploadWardrobeImage = async (uri) => {
    calls.push(uri);
    if (calls.length === 1) return original.promise;
    return 'https://storage.test/master.png';
  };

  const resultPromise = persistGarmentMaster({
    sourceUri: 'file:///source.jpg',
    userId: 'user-1',
    photoType: 'flat_lay',
    acceptance: accepted,
  }, upload);

  await Promise.resolve();
  assert.deepEqual(calls, ['file:///source.jpg']);

  original.resolve('https://storage.test/original.jpg');
  const result = await resultPromise;

  assert.deepEqual(calls, ['file:///source.jpg', accepted.uri]);
  assert.equal(result.ok, true);
});

test('accepted master persists original then master and returns durable metadata', async () => {
  const harness = recordingUploader([
    'https://storage.test/original.jpg',
    'https://storage.test/master.png',
  ]);

  const result = await persistGarmentMaster({
    sourceUri: 'file:///source.jpg',
    userId: 'user-1',
    photoType: 'flat_lay',
    acceptance: accepted,
  }, harness.upload);

  assert.deepEqual(harness.calls, [
    { uri: 'file:///source.jpg', userId: 'user-1', subfolder: 'originals', persistRemote: true },
    { uri: accepted.uri, userId: 'user-1', subfolder: undefined, persistRemote: true },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, 'transparent_master');
  assert.equal(result.imageUrl, 'https://storage.test/master.png');
  assert.equal(result.metadata.original_image_url, 'https://storage.test/original.jpg');
  assert.equal(result.metadata.standardized_image_url, 'https://storage.test/master.png');
  assert.equal(result.metadata.photo_type, 'flatlay');
  assert.deepEqual(result.metadata.visible_bounds, { left: 0.1, top: 0.2, width: 0.5, height: 0.6 });
  assert.equal(JSON.stringify(result.metadata).includes('data:image/png'), false);
});

test('processing rejection persists only the durable original', async () => {
  const harness = recordingUploader(['https://storage.test/original.jpg']);

  const result = await persistGarmentMaster({
    sourceUri: 'file:///source.jpg',
    userId: 'user-1',
    photoType: 'product',
    acceptance: { ok: false, reason: 'unverified' },
  }, harness.upload);

  assert.equal(harness.calls.length, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, 'fallback_original');
  assert.equal(result.imageUrl, 'https://storage.test/original.jpg');
  assert.equal(result.metadata.standardization_ok, false);
  assert.equal(result.metadata.standardized_image_url, null);
});

test('service failures persist only sanitized request ID and accurate failed stage', async () => {
  const harness = recordingUploader(['https://storage.test/original.jpg']);
  const imageMarker = ['service', 'image', 'marker'].join('-');
  const secretMarker = ['service', 'secret', 'marker'].join('-');

  const result = await persistGarmentMaster({
    sourceUri: 'file:///source.jpg',
    userId: 'user-1',
    photoType: 'flatlay',
    acceptance: { ok: false, reason: 'missing' },
    diagnostics: {
      requestId: 'req-service-123',
      failedStage: 'client_timeout',
      image_ref: `data:image/png;base64,${imageMarker}`,
      message: secretMarker,
      stack: secretMarker,
      provider_payload: { marker: secretMarker },
    },
  } as any, harness.upload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.metadata.request_id, 'req-service-123');
  assert.equal(result.metadata.failure_stage, 'client_timeout');
  assertMetadataHasNoDiagnosticPayload(result.metadata, [imageMarker, secretMarker]);
});

test('contract rejection persists response stage and sanitized request ID only', async () => {
  const harness = recordingUploader(['https://storage.test/original.jpg']);
  const imageMarker = ['contract', 'image', 'marker'].join('-');
  const response = {
    ...accepted.response,
    image_ref: `data:image/png;base64,${imageMarker}`,
    alpha_verified: false,
    failure_stage: 'A2.alpha_validate',
    trace: { request_id: 'untrusted-trace-id', provider_payload: imageMarker },
  };

  const result = await persistGarmentMaster({
    sourceUri: 'file:///source.jpg',
    userId: 'user-1',
    photoType: 'flatlay',
    acceptance: { ok: false, reason: 'unverified', response },
    diagnostics: { requestId: 'req-contract-456', failedStage: 'wrong_stage' },
  } as any, harness.upload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.metadata.request_id, 'req-contract-456');
  assert.equal(result.metadata.failure_stage, 'A2.alpha_validate');
  assertMetadataHasNoDiagnosticPayload(result.metadata, [imageMarker, 'untrusted-trace-id']);
});

test('diagnostic whitelist rejects unsafe request IDs and stages', async () => {
  const harness = recordingUploader(['https://storage.test/original.jpg']);
  const unsafeMarker = ['unsafe', 'diagnostic', 'marker'].join('-');
  const result = await persistGarmentMaster({
    sourceUri: 'file:///source.jpg',
    userId: 'user-1',
    photoType: 'flatlay',
    acceptance: { ok: false, reason: 'missing' },
    diagnostics: {
      requestId: `bad request=${unsafeMarker}`,
      failedStage: `bad stage;${unsafeMarker}`,
    },
  } as any, harness.upload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal('request_id' in result.metadata, false);
  assert.equal(result.metadata.failure_stage, 'missing');
  assertMetadataHasNoDiagnosticPayload(result.metadata, [unsafeMarker]);
});

test('master upload failure falls back to durable original and clears old master pointer', async () => {
  const harness = recordingUploader(['https://storage.test/original.jpg', null]);

  const result = await persistGarmentMaster({
    sourceUri: 'file:///source.jpg',
    userId: 'user-1',
    photoType: 'web',
    acceptance: accepted,
    diagnostics: { requestId: 'req-upload-789', failedStage: 'A2.visual_verify' },
  }, harness.upload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, 'fallback_original');
  assert.equal(result.imageUrl, 'https://storage.test/original.jpg');
  assert.equal(result.metadata.request_id, 'req-upload-789');
  assert.equal(result.metadata.failure_stage, 'transparent_upload');
  assert.equal(result.metadata.standardized_image_url, null);
});

test('original upload failure stops before master upload or metadata creation', async () => {
  const harness = recordingUploader([null]);

  const result = await persistGarmentMaster({
    sourceUri: 'file:///source.jpg',
    userId: 'user-1',
    photoType: 'flat_lay',
    acceptance: accepted,
  }, harness.upload);

  assert.equal(harness.calls.length, 1);
  assert.deepEqual(result, { ok: false, reason: 'original_upload_failed' });
});

test('HTTP provider source and accepted master are both forced into durable storage', async () => {
  const harness = recordingUploader([
    'https://storage.test/original.jpg',
    'https://storage.test/master.png',
  ]);

  const result = await persistGarmentMaster({
    sourceUri: 'https://provider.test/source.jpg',
    userId: 'user-1',
    photoType: 'product',
    acceptance: { ...accepted, uri: 'https://provider.test/master.png' },
  }, harness.upload);

  assert.equal(result.ok, true);
  assert.deepEqual(harness.calls.map((call) => call.persistRemote), [true, true]);
  if (!result.ok) return;
  assert.equal(result.metadata.original_uri, 'https://storage.test/original.jpg');
  assert.equal(result.metadata.standardized_image_url, 'https://storage.test/master.png');
});

test('replacement persistence decision requires a newly selected URI', () => {
  assert.equal(shouldPersistReplacementImage(null), false);
  assert.equal(shouldPersistReplacementImage(undefined), false);
  assert.equal(shouldPersistReplacementImage(''), false);
  assert.equal(shouldPersistReplacementImage('file:///replacement.jpg'), true);
});

test('ordinary edit save cannot standardize or persist an untouched image', () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const editSource = readFileSync(
    resolve(testDirectory, '../app/wardrobe/edit/[id].tsx'),
    'utf8',
  );
  const replacementHook = readFileSync(
    resolve(testDirectory, '../hooks/useGarmentImageReplace.ts'),
    'utf8',
  );
  const saveStart = editSource.indexOf('const handleSave =');
  const saveEnd = editSource.indexOf('\n\n  if (!item)', saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);

  const ordinarySaveFlow = editSource.slice(saveStart, saveEnd);
  assert.match(editSource, /useGarmentImageReplace\s*\(/);
  assert.match(editSource, /onPress=\{imageReplace\.pickAndReplace\}/);
  assert.match(replacementHook, /shouldPersistReplacementImage\s*\(/);
  assert.match(replacementHook, /persistGarmentMaster\s*\(/);
  assert.doesNotMatch(replacementHook, /flat_lay/);
  assert.equal(replacementHook.match(/'flatlay'/g)?.length, 2);
  assert.doesNotMatch(ordinarySaveFlow, /aiStandardizeGarment\s*\(|persistGarmentMaster\s*\(/);
});

test('add failure state offers retry and explicit original-image fallback actions', () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const addSource = readFileSync(
    resolve(testDirectory, '../app/wardrobe/add.tsx'),
    'utf8',
  );
  const failureStart = addSource.indexOf("{stdState === 'failed' ?");
  const actionsStart = addSource.indexOf('<View style={styles.imageActions}>', failureStart);
  assert.ok(failureStart >= 0 && actionsStart > failureStart);

  const failureState = addSource.slice(failureStart, actionsStart);
  assert.match(failureState, /透明主图生成失败/);
  assert.match(failureState, /TouchableOpacity/);
  assert.match(failureState, /refresh-cw/);
  assert.match(failureState, />重试</);
  assert.match(failureState, />用原图保存</);
  assert.match(addSource, /stdRetryBtn|stdRetryBtnText/);
});
