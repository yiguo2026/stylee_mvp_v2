import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { verifyStymobileVendor } from './stymobile-vendor-contract.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceCommit = '5b9b51adfb1dc9c10c61f13244087f6ecf54d34d';
const vendorRelativePath = join('vendor', 'stymobile', sourceCommit);

function contractsTarball(root) {
  return join(root, vendorRelativePath, 'stymobile-contracts-0.1.0.tgz');
}

function coreTarball(root) {
  return join(root, vendorRelativePath, 'stymobile-core-0.1.0.tgz');
}

function manifestPath(root) {
  return join(root, vendorRelativePath, 'provenance.json');
}

async function readManifest(root) {
  return JSON.parse(await readFile(manifestPath(root), 'utf8'));
}

async function writeManifest(root, manifest) {
  await writeFile(manifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function readLock(root) {
  return JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
}

async function writeLock(root, lock) {
  await writeFile(join(root, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
}

async function copyFixture(t) {
  const fixture = await mkdtemp(join(tmpdir(), 'stylee-stymobile-vendor-test-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await Promise.all([
    cp(join(repositoryRoot, 'package.json'), join(fixture, 'package.json')),
    cp(join(repositoryRoot, 'package-lock.json'), join(fixture, 'package-lock.json')),
    mkdir(dirname(join(fixture, vendorRelativePath)), { recursive: true }).then(() =>
      cp(join(repositoryRoot, 'vendor', 'stymobile'), join(fixture, 'vendor', 'stymobile'), {
        recursive: true,
      }),
    ),
  ]);
  return fixture;
}

test('accepts the exact merged contracts/core pair and isolated consumers', async () => {
  const result = await verifyStymobileVendor({ repositoryRoot, runConsumer: true });
  assert.deepEqual(result, {
    sourceCommit,
    packages: ['@stymobile/contracts', '@stymobile/core'],
  });

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    join(repositoryRoot, 'scripts', 'verify-stymobile-vendor.mjs'),
  ]);
  assert.equal(
    stdout,
    `Verified stymobile vendor: ${sourceCommit} @stymobile/contracts @stymobile/core\n`,
  );
  assert.equal(stderr, '');
});

test('rejects a tarball byte mismatch', async (t) => {
  const fixture = await copyFixture(t);
  await appendFile(coreTarball(fixture), Buffer.from([0]));
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    /tarball_sha256_mismatch/,
  );
});

test('rejects source SHA or package-list drift', async (t) => {
  const fixture = await copyFixture(t);
  const manifest = await readManifest(fixture);
  manifest.source.commit = '0000000000000000000000000000000000000000';
  await writeManifest(fixture, manifest);
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    /source_commit_mismatch/,
  );
});

test('rejects a symlinked artifact', async (t) => {
  const fixture = await copyFixture(t);
  const target = coreTarball(fixture);
  await rm(target);
  await symlink(contractsTarball(fixture), target);
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    /artifact_must_be_regular_file/,
  );
});

test('rejects lockfile resolution or integrity drift', async (t) => {
  const fixture = await copyFixture(t);
  const lock = await readLock(fixture);
  lock.packages['node_modules/@stymobile/core'].resolved = 'file:../floating-core';
  await writeLock(fixture, lock);
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    /lockfile_resolution_mismatch/,
  );
  await assert.rejects(
    execFileAsync(process.execPath, [
      join(repositoryRoot, 'scripts', 'verify-stymobile-vendor.mjs'),
      '--repository-root',
      fixture,
    ]),
    (error) => error.code === 1 && error.stdout === '' && error.stderr === 'lockfile_resolution_mismatch\n',
  );
});

test('rejects an injected dependency and package in the vendored lock contract', async (t) => {
  const fixture = await copyFixture(t);
  const lock = await readLock(fixture);
  lock.packages['node_modules/@stymobile/contracts'].dependencies = {
    'injected-package': '1.0.0',
  };
  lock.packages['node_modules/injected-package'] = {
    version: '1.0.0',
    resolved: 'https://registry.example.invalid/injected-package-1.0.0.tgz',
    integrity: 'sha512-synthetic-only',
  };
  await writeLock(fixture, lock);
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    /lockfile_package_mismatch/,
  );
});

for (const section of ['devDependencies', 'optionalDependencies', 'peerDependencies']) {
  test(`rejects manifest-section drift in ${section}`, async (t) => {
    const fixture = await copyFixture(t);
    const manifest = JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8'));
    manifest[section] = { ...manifest[section], '@stymobile/extra': '1.0.0' };
    await writeFile(join(fixture, 'package.json'), JSON.stringify(manifest));
    await assert.rejects(verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
      { message: 'third_stymobile_package' });
  });
}

for (const name of ['extra', 'core']) {
  test(`rejects nested ${name === 'core' ? 'duplicate' : 'unlisted'} stymobile package`, async (t) => {
    const fixture = await copyFixture(t);
    const lock = await readLock(fixture);
    lock.packages[`node_modules/parent/node_modules/@stymobile/${name}`] = { version: '0.1.0' };
    await writeLock(fixture, lock);
    await assert.rejects(verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
      { message: 'third_stymobile_package' });
  });
}

test('rejects compiler ancestor symlink escape for containment before executing it', async (t) => {
  const fixture = await copyFixture(t);
  await mkdir(join(fixture, 'node_modules'));
  await symlink(join(repositoryRoot, 'node_modules', 'typescript'), join(fixture, 'node_modules', 'typescript'));
  await assert.rejects(verifyStymobileVendor({ repositoryRoot: fixture }),
    { message: 'compiler_path_invalid' });
});

test('rejects a running Node major mismatch without changing the host runtime', async () => {
  const moduleUrl = new URL('./stymobile-vendor-contract.mjs', import.meta.url).href;
  const probe = `Object.defineProperty(process.versions, 'node', { value: '20.0.0' });
    const { verifyStymobileVendor } = await import(${JSON.stringify(moduleUrl)});
    await verifyStymobileVendor({ repositoryRoot: ${JSON.stringify(repositoryRoot)} });`;
  await assert.rejects(execFileAsync(process.execPath, ['--input-type=module', '-e', probe]),
    (error) => error.code === 1 && /Error: toolchain_mismatch/.test(error.stderr));
});

test('rejects a running npm mismatch with a finite safe error', async (t) => {
  const fixture = await copyFixture(t);
  const bin = join(fixture, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'npm'), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "10.0.0-private-detail"; else exit 41; fi\n', { mode: 0o755 });
  await assert.rejects(execFileAsync(process.execPath, [join(repositoryRoot, 'scripts', 'verify-stymobile-vendor.mjs')],
    { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }),
  (error) => error.code === 1 && error.stderr === 'toolchain_mismatch\n' && error.stdout === '');
});
