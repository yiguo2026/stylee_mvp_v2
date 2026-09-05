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
