import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workflowPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../.github/workflows/model-service-sync.yml',
);

test('mirror CI separates untrusted PR verification from trusted canonical verification', () => {
  assert.equal(existsSync(workflowPath), true, 'model-service mirror workflow must exist');

  const workflow = readFileSync(workflowPath, 'utf8');
  const prJobStart = workflow.indexOf('  pr-mirror:');
  const trustedJobStart = workflow.indexOf('  trusted-main-mirror:');

  assert.ok(prJobStart >= 0, 'pull requests need a fork-safe mirror-only job');
  assert.ok(trustedJobStart > prJobStart, 'trusted verification must be a separate job');

  const prJob = workflow.slice(prJobStart, trustedJobStart);
  const trustedJob = workflow.slice(trustedJobStart);

  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\n    branches: \[main\]/);
  assert.match(prJob, /if: github\.event_name == 'pull_request'/);
  assert.match(
    trustedJob,
    /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' && github\.repository == 'yiguo2026\/stylee_mvp_v2'/,
  );

  assert.match(prJob, /Read pinned canonical commit/);
  assert.match(prJob, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(prJob, /python model-service\/scripts\/build_rag_manifest\.py --dir model-service\/data\/garments2look --check/);
  assert.match(prJob, /python -m pip install --requirement model-service\/requirements\.txt/);
  assert.match(prJob, /for test_file in model-service\/test_\*\.py; do/);
  assert.doesNotMatch(prJob, /STYLE_MODEL_READ_TOKEN|fitzw\/style-model|canonical-model-service/);

  assert.match(trustedJob, /repository: fitzw\/style-model/);
  assert.match(trustedJob, /ref: \$\{\{ steps\.upstream\.outputs\.sha \}\}/);
  assert.match(trustedJob, /token: \$\{\{ secrets\.STYLE_MODEL_READ_TOKEN \}\}/);
  assert.match(trustedJob, /persist-credentials: false/);
  assert.match(trustedJob, /bash scripts\/check-model-service-sync\.sh canonical-model-service/);
  assert.match(trustedJob, /python -m pip install --requirement canonical-model-service\/requirements\.txt/);
  assert.match(trustedJob, /for test_root in canonical-model-service model-service; do/);
  assert.match(trustedJob, /for test_file in "\$test_root"\/test_\*\.py; do/);

  assert.match(workflow, /actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7\.0\.0/);
  assert.match(workflow, /actions\/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97 # v7\.0\.0/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-python)@v/);
  const actionRefs = [...workflow.matchAll(/^\s*uses:\s+([^\s#]+)/gm)].map((match) => match[1]);
  assert.ok(actionRefs.length > 0, 'workflow must declare its action dependencies');
  for (const actionRef of actionRefs) {
    assert.match(actionRef, /@[0-9a-f]{40}$/, `action must use an immutable commit SHA: ${actionRef}`);
  }
  assert.doesNotMatch(workflow, /if:.*secrets\.STYLE_MODEL_READ_TOKEN/);
  assert.doesNotMatch(workflow, /env:\n(?:.*\n)*?\sSTYLE_MODEL_READ_TOKEN:/);
  assert.deepEqual(
    workflow.match(/secrets\.STYLE_MODEL_READ_TOKEN[^\n]*/g),
    ['secrets.STYLE_MODEL_READ_TOKEN }}'],
    'the private credential may only authenticate the pinned canonical checkout',
  );
});
