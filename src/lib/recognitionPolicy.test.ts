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
