import assert from 'node:assert';
import { test } from 'node:test';

import {
  canOperateImportTask,
  formatRecognitionFailure,
  summarizeImportTasks,
  tasksForUser,
} from './importTaskPolicy.ts';

const task = (id: string, ownerUserId: string, status: string) => ({ id, ownerUserId, status });

test('tasks are visible and operable only for their owner', () => {
  const tasks = [task('a', 'user-a', 'failed'), task('b', 'user-b', 'pending')];
  assert.deepEqual(tasksForUser(tasks, 'user-a').map((item) => item.id), ['a']);
  assert.deepEqual(tasksForUser(tasks, 'user-b').map((item) => item.id), ['b']);
  assert.deepEqual(tasksForUser(tasks, null), []);
  assert.equal(canOperateImportTask(tasks[0], 'user-a'), true);
  assert.equal(canOperateImportTask(tasks[0], 'user-b'), false);
  assert.equal(canOperateImportTask(tasks[0], null), false);
});

test('summary counters are derived from retained tasks', () => {
  assert.deepEqual(summarizeImportTasks([
    task('a', 'user-a', 'failed'),
    task('b', 'user-a', 'needs_selection'),
    task('c', 'user-a', 'done'),
    task('d', 'user-a', 'detecting'),
  ]), {
    totalCount: 4,
    completedCount: 1,
    failedCount: 1,
    pendingSelectionCount: 1,
  });
});

test('recognition failure copy retains safe diagnostics', () => {
  assert.equal(formatRecognitionFailure({
    requestId: 'req-timeout-123',
    failedStage: 'A1.multi_vision_recognize',
    errorType: 'ProviderTimeoutError',
  }), '识别超时，请重试 · req-timeout-123');
  assert.equal(formatRecognitionFailure({
    requestId: 'req-bad value',
    failedStage: 'client_request',
    errorType: 'TypeError',
  }), '识别失败，请重试');
});
