import { test } from 'node:test';
import assert from 'node:assert';
import { storageFormatFor } from './imageUploadPolicy.ts';

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
