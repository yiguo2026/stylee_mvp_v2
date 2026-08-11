import { test } from 'node:test';
import assert from 'node:assert';
import { storageFormatFor } from './imageUploadPolicy.ts';
import {
  createWardrobeImageUploader,
  persistGarmentMaster,
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

test('master upload failure falls back to durable original and clears old master pointer', async () => {
  const harness = recordingUploader(['https://storage.test/original.jpg', null]);

  const result = await persistGarmentMaster({
    sourceUri: 'file:///source.jpg',
    userId: 'user-1',
    photoType: 'web',
    acceptance: accepted,
  }, harness.upload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, 'fallback_original');
  assert.equal(result.imageUrl, 'https://storage.test/original.jpg');
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
