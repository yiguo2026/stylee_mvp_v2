import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workflowPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../.github/workflows/model-service-sync.yml',
);

test('mirror CI verifies the SHA-pinned private canonical checkout without exposing its token', () => {
  assert.equal(existsSync(workflowPath), true, 'model-service mirror workflow must exist');

  const workflow = readFileSync(workflowPath, 'utf8');
  const appCheckout = workflow.indexOf('uses: actions/checkout@v4');
  const readPin = workflow.indexOf('Read pinned canonical commit');
  const privateCheckout = workflow.indexOf('Checkout pinned canonical source');
  const checker = workflow.indexOf('Check generated mirror against canonical source');

  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.equal((workflow.match(/uses: actions\/checkout@v4/g) ?? []).length, 2);
  assert.ok(appCheckout >= 0, 'App checkout must happen before reading the pin');
  assert.ok(readPin > appCheckout, 'the pin must come from the checked-out App revision');
  assert.ok(privateCheckout > readPin, 'private checkout must use the validated App pin');
  assert.ok(checker > privateCheckout, 'the mirror check must run after the private checkout');

  assert.match(workflow, /UPSTREAM_COMMIT/);
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /repository: fitzw\/style-model/);
  assert.match(workflow, /ref: \$\{\{ steps\.upstream\.outputs\.sha \}\}/);
  assert.match(workflow, /token: \$\{\{ secrets\.STYLE_MODEL_READ_TOKEN \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /secrets\.STYLE_MODEL_READ_TOKEN == ''/);
  assert.match(workflow, /Missing required GitHub secret: STYLE_MODEL_READ_TOKEN/);
  assert.match(workflow, /bash scripts\/check-model-service-sync\.sh canonical-model-service/);
  assert.match(workflow, /for test_root in canonical-model-service model-service; do/);
  assert.match(workflow, /tests=\("\$test_root"\/test_\*\.py\)/);

  assert.doesNotMatch(workflow, /env:\n(?:.*\n)*?\sSTYLE_MODEL_READ_TOKEN:/);
  assert.deepEqual(
    workflow.match(/secrets\.STYLE_MODEL_READ_TOKEN[^\n]*/g),
    [
      "secrets.STYLE_MODEL_READ_TOKEN == '' }}",
      'secrets.STYLE_MODEL_READ_TOKEN }}',
    ],
    'the private credential may only gate the clear missing-secret error and authenticate checkout',
  );
});
