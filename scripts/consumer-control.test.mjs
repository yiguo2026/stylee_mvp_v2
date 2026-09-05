import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
const root = new URL('../', import.meta.url);
const scripts = JSON.parse(readFileSync(new URL('package.json', root))).scripts;
const workflow = (name) => load(readFileSync(new URL(`.github/workflows/${name}.yml`, root), 'utf8'));

test('consumer gate stops at a failing vendor test before accepting account checks', () => {
  assert.equal(typeof scripts['check:consumer'], 'string');
  const dir = mkdtempSync(path.join(tmpdir(), 'consumer-gate-'));
  try {
    // Substitute command boundaries only; execute the actual npm script's shell control flow.
    writeFileSync(path.join(dir, 'npm'), '#!/bin/sh\necho "$2"\nif [ "$2" = "$FAIL_GATE" ]; then exit 17; fi\n', { mode: 0o755 });
    for (const [failure, expected] of [
      ['', ['test:vendor', 'vendor:check', 'test:account-scope', 'test:account-scope-integration']],
      ['test:vendor', ['test:vendor']],
      ['vendor:check', ['test:vendor', 'vendor:check']],
      ['test:account-scope', ['test:vendor', 'vendor:check', 'test:account-scope']],
      ['test:account-scope-integration', ['test:vendor', 'vendor:check', 'test:account-scope', 'test:account-scope-integration']],
    ]) {
      const result = spawnSync('/bin/sh', ['-c', scripts['check:consumer']], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAIL_GATE: failure }, encoding: 'utf8',
      });
      assert.equal(result.status, failure ? 17 : 0);
      assert.deepEqual(result.stdout.trim().split('\n'), expected);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('PR consumer job runs checks and placeholder build with no deployment authority', () => {
  const ci = workflow('consumer-control');
  assert.deepEqual(ci.permissions, { contents: 'read' });
  assert.deepEqual(ci.on.push.branches, ['main']);
  for (const event of ['push', 'pull_request']) {
    const paths = ci.on[event].paths;
    for (const required of ['package.json', 'package-lock.json', 'vendor/**', 'scripts/**', 'src/lib/**', 'src/stores/**', 'src/app/_layout.tsx', 'src/app/(auth)/login.tsx', '.github/workflows/consumer-control.yml']) assert.ok(paths.includes(required), required);
  }
  const job = ci.jobs.check;
  assert.equal(job.environment, undefined);
  const steps = job.steps;
  assert.equal(steps[0].uses, 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1');
  assert.equal(steps[1].uses, 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
  assert.equal(steps[1].with['node-version'], '22.22.1');
  assert.deepEqual(steps.filter(s => s.run).map(s => s.run), [
    'npm install --global npm@11.12.1', 'npm ci --ignore-scripts',
    'npm run test:consumer-control', 'npm run check', 'npm run build:web',
  ]);
  assert.deepEqual(steps.at(-1).env, {
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-placeholder',
    EXPO_PUBLIC_STYLEE_API: 'https://example.com',
  });
  assert.doesNotMatch(JSON.stringify(ci), /secrets\.|production|workflow_dispatch|deploy_token/i);
});

test('deployment checks consumer before reading deploy env and preserves deployment target', () => {
  const steps = workflow('deploy-web').jobs['build-and-deploy'].steps;
  assert.equal(steps.find(s => s.uses?.startsWith('actions/setup-node')).with['node-version'], 22);
  const index = (run) => steps.findIndex(s => s.run === run);
  assert.ok(index('npm install --global npm@11.12.1') < index('npm ci'));
  assert.ok(index('npm run check:consumer') > index('npm ci'));
  assert.ok(index('npm run check:consumer') < steps.findIndex(s => s.name === 'Validate deploy env'));
  assert.equal(steps.at(-1).uses, 'peaceiris/actions-gh-pages@v4');
  assert.equal(steps.at(-1).with.external_repository, 'yiguo2026/yiguo2026.github.io');
  assert.equal(steps.at(-1).with.publish_branch, 'gh-pages');
});

test('design guard selects npm before installation', () => {
  const steps = workflow('design-system').jobs.validate.steps;
  const npm = steps.findIndex(s => s.run === 'npm install --global npm@11.12.1');
  assert.ok(npm > steps.findIndex(s => s.uses?.startsWith('actions/setup-node')));
  assert.ok(npm < steps.findIndex(s => s.run === 'npm ci'));
});

for (const eventName of ['pull_request', 'push']) {
  test(`consumer ${eventName} checkout and base catch a violation before the last commit`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'consumer-history-'));
    const source = path.join(dir, 'source');
    const checkout = path.join(dir, 'checkout');
    mkdirSync(source);
    const git = (args, cwd = source) => {
      const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    const write = (name, content) => {
      mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
      writeFileSync(path.join(source, name), content);
    };
    const commit = () => {
      git(['add', '.']);
      git(['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '-m', 'synthetic']);
      return git(['rev-parse', 'HEAD']);
    };
    try {
      git(['init', '-b', 'main']);
      for (const name of ['(tabs)/index', 'wardrobe/[id]', 'outfit/[id]', 'outfit/result',
        'outfit/try-on', 'outfit/try-on-result', 'outfit/try-on-detail']) write(`src/app/${name}.tsx`, '');
      write('src/app/probe.tsx', 'export const style = {};\n');
      const base = commit();
      write('src/app/probe.tsx', 'export const style = { color: "#abcdef" };\n');
      commit();
      write('README.md', 'A later unrelated commit\n');
      commit();
      const steps = workflow('consumer-control').jobs.check.steps;
      const depth = steps.find(step => step.uses?.startsWith('actions/checkout')).with?.['fetch-depth'] ?? 1;
      git(['clone', ...(depth === 0 ? [] : ['--depth', String(depth)]), `file://${source}`, checkout], dir);
      const event = eventName === 'pull_request' ? { pull_request: { base: { sha: base } } } : { before: base };
      // Evaluate the workflow's supported GitHub context expression against each
      // synthetic event, then execute the actual design checker in that checkout.
      const expression = steps.find(step => step.run === 'npm run check').env?.DESIGN_SYSTEM_BASE ?? '';
      const resolvedBase = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '').split('||')
        .map(term => term.trim().split('.').reduce((value, key) => value?.[key], { github: { event } }))
        .find(Boolean);
      const result = spawnSync(process.execPath, [new URL('scripts/check-design-system.mjs', root).pathname], {
        cwd: checkout, encoding: 'utf8', env: { ...process.env, DESIGN_SYSTEM_BASE: resolvedBase ?? '' },
      });
      assert.equal(result.status, 1, `must reject the earlier raw color: ${result.stdout} ${result.stderr}`);
      assert.match(result.stderr, /\[raw-color\]/);
      assert.equal(resolvedBase, base);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
