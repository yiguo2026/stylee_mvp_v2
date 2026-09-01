import assert from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSingleFlightScheduler,
  processImportSubtasks,
  resetImportSubtasksForRetry,
  type ImportSubtaskState,
} from './importBatchProcessor.ts';

test('bounded import processing never runs more than two garment jobs at once', async () => {
  let active = 0;
  let maxActive = 0;

  const result = await processImportSubtasks({
    items: ['shirt', 'skirt', 'belt', 'shoes', 'bag'],
    concurrency: 2,
    process: async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { ok: true as const, value: item + '-master' };
    },
  });

  assert.equal(maxActive, 2);
  assert.deepEqual(result.states.map((state) => state.status), [
    'succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded',
  ]);
});

test('a retryable garment failure retries only that item and never reruns successes', async () => {
  const calls: number[] = [];
  const result = await processImportSubtasks({
    items: ['shirt', 'skirt', 'shoes'],
    concurrency: 1,
    maxAttempts: 2,
    process: async (_item, index, attempt) => {
      calls.push(index);
      if (index === 1 && attempt === 1) {
        return { ok: false as const, failureStage: 'A2.image_edit', retryable: true };
      }
      return { ok: true as const, value: 'saved-' + index };
    },
  });

  assert.deepEqual(calls, [0, 1, 2, 1]);
  assert.deepEqual(result.states.map((state) => state.attempts), [1, 2, 1]);
  assert.deepEqual(result.states.map((state) => state.status), [
    'succeeded', 'succeeded', 'succeeded',
  ]);
});

test('two client timeouts open the circuit and leave untouched items waiting', async () => {
  const calls: number[] = [];
  const result = await processImportSubtasks({
    items: ['shirt', 'skirt', 'belt', 'shoes', 'bag'],
    concurrency: 2,
    timeoutCircuitThreshold: 2,
    process: async (_item, index) => {
      calls.push(index);
      return { ok: false as const, failureStage: 'client_timeout', retryable: true };
    },
  });

  assert.deepEqual(calls.sort(), [0, 1]);
  assert.equal(result.circuitOpen, true);
  assert.deepEqual(result.states.map((state) => state.status), [
    'failed', 'failed', 'waiting', 'waiting', 'waiting',
  ]);
});

test('a fast first timeout does not start the next wave before its peer settles', async () => {
  const calls: number[] = [];
  let releaseSecond: (() => void) | undefined;
  const second = new Promise<void>((resolve) => { releaseSecond = resolve; });
  const running = processImportSubtasks({
    items: ['shirt', 'skirt', 'belt', 'shoes'],
    concurrency: 2,
    timeoutCircuitThreshold: 2,
    process: async (_item, index) => {
      calls.push(index);
      if (index === 1) await second;
      return { ok: false as const, failureStage: 'client_timeout', retryable: true };
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, [0, 1]);
  releaseSecond?.();
  const result = await running;
  assert.equal(result.circuitOpen, true);
  assert.deepEqual(result.states.slice(2).map((state) => state.status), ['waiting', 'waiting']);
});

test('a successful garment breaks the consecutive-timeout streak', async () => {
  const result = await processImportSubtasks({
    items: ['shirt', 'skirt', 'belt'],
    concurrency: 1,
    timeoutCircuitThreshold: 2,
    process: async (_item, index) => index === 1
      ? { ok: true as const, value: 'saved-skirt' }
      : { ok: false as const, failureStage: 'client_timeout', retryable: true },
  });

  assert.equal(result.circuitOpen, false);
  assert.deepEqual(result.states.map((state) => state.status), [
    'failed', 'succeeded', 'failed',
  ]);
});

test('single-flight scheduler coalesces repeated starts and runs queued work serially', async () => {
  let active = 0;
  let maxActive = 0;
  let runCount = 0;
  let pending = true;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const scheduler = createSingleFlightScheduler(
    async () => {
      runCount += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      pending = false;
      await gate;
      active -= 1;
    },
    () => pending,
  );

  const first = scheduler();
  const second = scheduler();
  assert.strictEqual(first, second);
  pending = true;
  release?.();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(runCount, 2);
  assert.equal(maxActive, 1);
});

test('manual retry resets only failed or waiting items', async () => {
  const previous: ImportSubtaskState<string>[] = [
    { index: 0, status: 'succeeded', attempts: 1, value: 'saved-shirt' },
    { index: 1, status: 'failed', attempts: 2, failureStage: 'client_timeout', retryable: true },
    { index: 2, status: 'waiting', attempts: 0, failureStage: 'circuit_open', retryable: true },
  ];

  const reset = resetImportSubtasksForRetry(previous);
  assert.strictEqual(reset[0], previous[0]);
  assert.deepEqual(reset.slice(1), [
    { index: 1, status: 'pending', attempts: 0 },
    { index: 2, status: 'pending', attempts: 0 },
  ]);

  const calls: number[] = [];
  const result = await processImportSubtasks({
    items: ['shirt', 'skirt', 'shoes'],
    initialStates: reset,
    concurrency: 2,
    process: async (_item, index) => {
      calls.push(index);
      return { ok: true as const, value: 'saved-' + index };
    },
  });

  assert.deepEqual(calls.sort(), [1, 2]);
  assert.equal(result.states[0].value, 'saved-shirt');
});

test('import store wires single-flight scheduling and preserves try-on attributes', () => {
  const testDirectory = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(testDirectory, '../stores/importStore.ts'), 'utf8');

  assert.doesNotMatch(source, /void processQueue\(\)/);
  assert.match(source, /createSingleFlightScheduler\s*\(/);
  assert.match(source, /target\.status !== 'needs_selection'/);
  assert.match(source, /target\.status !== 'failed'/);
  assert.match(source, /retryable: true,[\s\S]{0,400}persistBatchImportMaster/);
  assert.match(source, /fit_type: item\.fit_type/);
  assert.match(source, /sleeve_length: item\.sleeve_length/);
  assert.match(source, /description: item\.description \|\| undefined/);
  assert.match(source, /target_bbox_missing/);
  assert.match(source, /import_key: importKey/);
  assert.ok(
    source.indexOf('missingTargetBoxIndices(detectedItemCount')
      < source.indexOf('const batch = await processImportSubtasks'),
    'target boxes must be preflighted before any garment processing starts',
  );
});
