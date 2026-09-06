import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  open,
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

import * as vendorContract from './stymobile-vendor-contract.mjs';

const { verifyStymobileVendor } = vendorContract;
const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceCommit = 'a2c1342878aa5fcd1ad21651085d319bda19a3e1';
const sourceTree = '03814cceb1084c94c33898d1e315c035a441d045';
const vendorRelativePath = join('vendor', 'stymobile', sourceCommit);
const packageNames = [
  '@stymobile/contracts',
  '@stymobile/core',
  '@stymobile/api-client',
];

function tarballPath(root, filename) {
  return join(root, vendorRelativePath, filename);
}

function contractsTarball(root) {
  return tarballPath(root, 'stymobile-contracts-0.3.0.tgz');
}

function coreTarball(root) {
  return tarballPath(root, 'stymobile-core-0.3.0.tgz');
}

function apiClientTarball(root) {
  return tarballPath(root, 'stymobile-api-client-0.2.1.tgz');
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

async function readRootManifest(root) {
  return JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
}

async function writeRootManifest(root, manifest) {
  await writeFile(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
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

async function exactRecord(name) {
  const provenance = await readManifest(repositoryRoot);
  return structuredClone(provenance.packages.find((entry) => entry.name === name));
}

async function verifyArtifact(record, path) {
  assert.equal(typeof vendorContract.verifyStymobilePackageArtifact, 'function');
  return vendorContract.verifyStymobilePackageArtifact({ packageRecord: record, tarballPath: path });
}

test('accepts the exact merged contracts/core/api-client set and cold consumer', async () => {
  const result = await verifyStymobileVendor({ repositoryRoot, runConsumer: true });
  assert.deepEqual(result, {
    sourceCommit,
    sourceTree,
    packages: packageNames,
  });

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    join(repositoryRoot, 'scripts', 'verify-stymobile-vendor.mjs'),
  ]);
  assert.equal(
    stdout,
    `Verified stymobile vendor: ${sourceCommit} ${packageNames.join(' ')}\n`,
  );
  assert.equal(stderr, '');
});

test('cold consumer installs only consumer-local artifacts and retains no outside resolution', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'stylee-stymobile-npm-wrapper-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const npmCli = process.env.npm_execpath;
  assert.equal(typeof npmCli, 'string');
  const auditPath = join(fixture, 'audit-consumer.mjs');
  await writeFile(
    auditPath,
    [
      "import { readFile } from 'node:fs/promises';",
      "import { isAbsolute } from 'node:path';",
      'for (const filename of ["package.json", "package-lock.json"]) {',
      '  const value = JSON.parse(await readFile(filename, "utf8"));',
      '  const pending = [value];',
      '  while (pending.length > 0) {',
      '    const current = pending.pop();',
      '    if (typeof current === "string") {',
      '      if (/^https?:\\/\\//u.test(current)) process.exit(71);',
      '      if (current.startsWith("file:")) {',
      '        const target = current.slice(5);',
      '        if (isAbsolute(target) || target.split(/[\\\\/]/u).includes("..")) process.exit(72);',
      '      }',
      '    } else if (Array.isArray(current)) pending.push(...current);',
      '    else if (current && typeof current === "object") pending.push(...Object.values(current));',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  const bin = join(fixture, 'bin');
  await mkdir(bin);
  await writeFile(
    join(bin, 'npm'),
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then echo "11.12.1"; exit 0; fi',
      'if [ "$1" != "install" ]; then exit 73; fi',
      'for argument in "$@"; do case "$argument" in /*) exit 74;; esac; done',
      `"${process.execPath}" "${npmCli}" "$@" || exit $?`,
      `"${process.execPath}" "${auditPath}" || exit $?`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [join(repositoryRoot, 'scripts', 'verify-stymobile-vendor.mjs')],
    { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } },
  );
  assert.equal(
    stdout,
    `Verified stymobile vendor: ${sourceCommit} ${packageNames.join(' ')}\n`,
  );
  assert.equal(stderr, '');
});

test('reverifies each consumer-local copy before passing it to npm', async () => {
  const source = await readFile(
    join(repositoryRoot, 'scripts', 'stymobile-vendor-contract.mjs'),
    'utf8',
  );
  const copyIndex = source.indexOf('await copyFile(tarballPaths[index], localTarballPath);');
  const verifyIndex = source.indexOf(
    'tarballPath: localTarballPath',
    copyIndex,
  );
  const installIndex = source.indexOf(
    "['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...consumerTarballPaths]",
    copyIndex,
  );
  assert.ok(copyIndex >= 0);
  assert.ok(verifyIndex > copyIndex);
  assert.ok(installIndex > verifyIndex);
});

test('rejects a missing api-client artifact', async (t) => {
  const fixture = await copyFixture(t);
  await rm(apiClientTarball(fixture));
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    { message: 'artifact_must_be_regular_file' },
  );
});

test('rejects package-list drift', async (t) => {
  const fixture = await copyFixture(t);
  const manifest = await readManifest(fixture);
  manifest.packages.reverse();
  await writeManifest(fixture, manifest);
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    { message: 'package_list_mismatch' },
  );
});

for (const [field, replacement, identifier] of [
  ['shasum', '0000000000000000000000000000000000000000', 'tarball_shasum_mismatch'],
  ['tarball_sha256', '0'.repeat(64), 'tarball_sha256_mismatch'],
  ['integrity', 'sha512-c3R5bW9iaWxlLW1pc21hdGNo', 'tarball_integrity_mismatch'],
  ['size', 1, 'tarball_size_mismatch'],
  ['unpacked_size', 1, 'artifact_unpacked_size_mismatch'],
  ['source_manifest_sha256', '0'.repeat(64), 'source_manifest_mismatch'],
]) {
  test(`rejects exact ${field} drift`, async () => {
    const record = await exactRecord('@stymobile/core');
    record[field] = replacement;
    await assert.rejects(verifyArtifact(record, coreTarball(repositoryRoot)), { message: identifier });
  });
}

test('rejects exact artifact file-list drift', async () => {
  const record = await exactRecord('@stymobile/core');
  record.files = record.files.slice(1);
  await assert.rejects(verifyArtifact(record, coreTarball(repositoryRoot)), {
    message: 'artifact_file_list_mismatch',
  });
});

for (const [name, dependencies, path] of [
  ['@stymobile/contracts', { '@stymobile/extra': '0.3.0' }, contractsTarball],
  ['@stymobile/core', { '@stymobile/contracts': '9.9.9' }, coreTarball],
  ['@stymobile/api-client', { '@stymobile/contracts': '0.3.0' }, apiClientTarball],
]) {
  test(`rejects exact ${name} dependency drift`, async () => {
    const record = await exactRecord(name);
    record.dependencies = dependencies;
    await assert.rejects(verifyArtifact(record, path(repositoryRoot)), {
      message: 'artifact_dependency_mismatch',
    });
  });
}

test('rejects a tarball byte mismatch', async (t) => {
  const fixture = await copyFixture(t);
  await appendFile(coreTarball(fixture), Buffer.from([0]));
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    { message: 'tarball_size_mismatch' },
  );
});

test('rejects an oversized regular artifact from metadata before attempting to read it', async (t) => {
  const fixture = await copyFixture(t);
  const path = coreTarball(fixture);
  await rm(path);
  const handle = await open(path, 'w');
  await handle.truncate(5 * 1024 * 1024 * 1024);
  await handle.close();
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    { message: 'tarball_size_mismatch' },
  );
});

for (const [label, mutate, identifier] of [
  ['schema version', (value) => { value.schema_version = 1; }, 'schema_version_mismatch'],
  ['source repository', (value) => { value.source.repository = 'https://example.invalid/private'; }, 'source_repository_mismatch'],
  ['source commit', (value) => { value.source.commit = '0'.repeat(40); }, 'source_commit_mismatch'],
  ['source tree', (value) => { value.source.tree = '0'.repeat(40); }, 'source_tree_mismatch'],
  ['Node toolchain', (value) => { value.toolchain.node = '20.0.0'; }, 'toolchain_mismatch'],
  ['npm toolchain', (value) => { value.toolchain.npm = '10.0.0'; }, 'toolchain_mismatch'],
  ['build commands', (value) => { value.toolchain.commands.pop(); }, 'toolchain_mismatch'],
]) {
  test(`rejects ${label} drift`, async (t) => {
    const fixture = await copyFixture(t);
    const manifest = await readManifest(fixture);
    mutate(manifest);
    await writeManifest(fixture, manifest);
    await assert.rejects(
      verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
      { message: identifier },
    );
  });
}

test('rejects a symlinked artifact', async (t) => {
  const fixture = await copyFixture(t);
  const target = coreTarball(fixture);
  await rm(target);
  await symlink(contractsTarball(fixture), target);
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    { message: 'artifact_must_be_regular_file' },
  );
});

test('rejects a vendor-directory symlink escape', async (t) => {
  const fixture = await copyFixture(t);
  const external = await mkdtemp(join(tmpdir(), 'stylee-stymobile-external-'));
  t.after(() => rm(external, { recursive: true, force: true }));
  await cp(join(repositoryRoot, vendorRelativePath), external, { recursive: true });
  await rm(join(fixture, vendorRelativePath), { recursive: true });
  await symlink(external, join(fixture, vendorRelativePath));
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    { message: 'provenance_path_invalid' },
  );
});

test('rejects lockfile resolution drift with finite output', async (t) => {
  const fixture = await copyFixture(t);
  const lock = await readLock(fixture);
  lock.packages['node_modules/@stymobile/core'].resolved = 'file:../floating-core';
  await writeLock(fixture, lock);
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    { message: 'lockfile_resolution_mismatch' },
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

test('rejects lockfile integrity drift', async (t) => {
  const fixture = await copyFixture(t);
  const lock = await readLock(fixture);
  lock.packages['node_modules/@stymobile/api-client'].integrity =
    'sha512-c3R5bW9iaWxlLW1pc21hdGNo';
  await writeLock(fixture, lock);
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    { message: 'lockfile_integrity_mismatch' },
  );
});

for (const name of ['@stymobile/core', '@stymobile/api-client']) {
  test(`rejects ${name} lock dependency drift`, async (t) => {
    const fixture = await copyFixture(t);
    const lock = await readLock(fixture);
    lock.packages[`node_modules/${name}`].dependencies['@stymobile/contracts'] = '9.9.9';
    await writeLock(fixture, lock);
    await assert.rejects(
      verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
      { message: 'lockfile_dependency_mismatch' },
    );
  });
}

for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  test(`rejects extra top-level stymobile package in ${section}`, async (t) => {
    const fixture = await copyFixture(t);
    const manifest = await readRootManifest(fixture);
    manifest[section] = { ...manifest[section], '@stymobile/extra': '1.0.0' };
    await writeRootManifest(fixture, manifest);
    await assert.rejects(
      verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
      { message: 'third_stymobile_package' },
    );
  });
}

for (const name of ['extra', 'core']) {
  test(`rejects nested ${name === 'core' ? 'duplicate' : 'unlisted'} stymobile lock entry`, async (t) => {
    const fixture = await copyFixture(t);
    const lock = await readLock(fixture);
    lock.packages[`node_modules/parent/node_modules/@stymobile/${name}`] = { version: '0.3.0' };
    await writeLock(fixture, lock);
    await assert.rejects(
      verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
      { message: 'third_stymobile_package' },
    );
  });
}

test('rejects an extra top-level stymobile lock entry', async (t) => {
  const fixture = await copyFixture(t);
  const lock = await readLock(fixture);
  lock.packages['node_modules/@stymobile/extra'] = { version: '0.3.0' };
  await writeLock(fixture, lock);
  await assert.rejects(
    verifyStymobileVendor({ repositoryRoot: fixture, runConsumer: false }),
    { message: 'third_stymobile_package' },
  );
});

test('rejects compiler ancestor symlink escape before executing it', async (t) => {
  const fixture = await copyFixture(t);
  await mkdir(join(fixture, 'node_modules'));
  await symlink(join(repositoryRoot, 'node_modules', 'typescript'), join(fixture, 'node_modules', 'typescript'));
  await assert.rejects(verifyStymobileVendor({ repositoryRoot: fixture }), {
    message: 'compiler_path_invalid',
  });
});

test('rejects a running Node major mismatch without changing the host runtime', async () => {
  const moduleUrl = new URL('./stymobile-vendor-contract.mjs', import.meta.url).href;
  const probe = `Object.defineProperty(process.versions, 'node', { value: '20.0.0' });
    const { verifyStymobileVendor } = await import(${JSON.stringify(moduleUrl)});
    await verifyStymobileVendor({ repositoryRoot: ${JSON.stringify(repositoryRoot)} });`;
  await assert.rejects(
    execFileAsync(process.execPath, ['--input-type=module', '-e', probe]),
    (error) => error.code === 1 && /Error: toolchain_mismatch/.test(error.stderr),
  );
});

test('rejects a running npm mismatch with a finite safe error', async (t) => {
  const fixture = await copyFixture(t);
  const bin = join(fixture, 'bin');
  await mkdir(bin);
  await writeFile(
    join(bin, 'npm'),
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "10.0.0-private-detail"; else exit 41; fi\n',
    { mode: 0o755 },
  );
  await assert.rejects(
    execFileAsync(process.execPath, [join(repositoryRoot, 'scripts', 'verify-stymobile-vendor.mjs')], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    }),
    (error) => error.code === 1 && error.stderr === 'toolchain_mismatch\n' && error.stdout === '',
  );
});
