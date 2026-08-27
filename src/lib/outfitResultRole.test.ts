import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('recommended item keeps its semantic role when it becomes owned in the current outfit', () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../app/outfit/result.tsx'),
    'utf8',
  );

  assert.match(
    source,
    /\{\s*item_id:\s*saved\.item_id,[^}]*role:\s*rec\.role,[^}]*item:\s*saved,?\s*\}/s,
  );
});
