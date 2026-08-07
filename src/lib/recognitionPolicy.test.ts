import { test } from 'node:test';
import assert from 'node:assert';

test('识别失败或空结果时不应用模型字段', async () => {
  const policy = await import('./recognitionPolicy.ts').catch(() => null);
  assert.ok(policy, '识别兜底策略模块应存在');
  assert.equal(policy.shouldApplyRecognition(false, 1), false);
  assert.equal(policy.shouldApplyRecognition(true, 0), false);
  assert.equal(policy.shouldApplyRecognition(true, 2), true);
});

test('失败识别即使携带 mock 单品也必须丢弃', async () => {
  const policy = await import('./recognitionPolicy.ts').catch(() => null);
  assert.ok(policy, '识别兜底策略模块应存在');
  const mockItems = [{ name: '棕色复古包' }];

  assert.deepEqual(policy.acceptedRecognitionItems(false, mockItems), []);
  assert.deepEqual(policy.acceptedRecognitionItems(true, mockItems), mockItems);
});

test('多品识别仅在旧服务缺少接口时回退单品识别', async () => {
  const policy = await import('./recognitionPolicy.ts').catch(() => null);
  assert.ok(policy, '识别兜底策略模块应存在');

  assert.equal(policy.shouldFallbackToSingleRecognition({ kind: 'http', status: 404 }), true);
  assert.equal(policy.shouldFallbackToSingleRecognition({ kind: 'http', status: 501 }), true);
  assert.equal(policy.shouldFallbackToSingleRecognition({ kind: 'http', status: 502 }), false);
  assert.equal(policy.shouldFallbackToSingleRecognition({ kind: 'http', status: 504 }), false);
  assert.equal(policy.shouldFallbackToSingleRecognition({ kind: 'timeout' }), false);
  assert.equal(policy.shouldFallbackToSingleRecognition({ kind: 'network' }), false);
  assert.equal(policy.shouldFallbackToSingleRecognition(undefined), false);
});

test('mock 或 degraded 响应不能标记为可信识别', async () => {
  const policy = await import('./recognitionPolicy.ts').catch(() => null);
  assert.ok(policy, '识别兜底策略模块应存在');

  assert.equal(policy.isTrustedRecognition('qwen3-vl-plus', false), true);
  assert.equal(policy.isTrustedRecognition('qwen3-vl-plus', true), false);
  assert.equal(policy.isTrustedRecognition('mock', false), false);
  assert.equal(policy.isTrustedRecognition(undefined, false), false);
});
