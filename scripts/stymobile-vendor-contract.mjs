import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const EXPECTED_SOURCE_COMMIT = '5b9b51adfb1dc9c10c61f13244087f6ecf54d34d';
export const EXPECTED_PACKAGE_NAMES = Object.freeze(['@stymobile/contracts', '@stymobile/core']);

const VENDOR_DIRECTORY = join('vendor', 'stymobile', EXPECTED_SOURCE_COMMIT);
const EXPECTED_PROVENANCE = Object.freeze({
  schema_version: 1,
  source: Object.freeze({
    repository: 'https://github.com/fitzw/stymobile',
    commit: EXPECTED_SOURCE_COMMIT,
  }),
  toolchain: Object.freeze({
    node: '22.22.1',
    npm: '11.12.1',
    commands: Object.freeze([
      'npm ci --ignore-scripts --no-audit --no-fund --offline',
      'npm run check',
      'npm pack --ignore-scripts --json ./packages/contracts ./packages/core',
    ]),
  }),
  packages: Object.freeze([
    Object.freeze({
      name: '@stymobile/contracts',
      version: '0.1.0',
      file: 'stymobile-contracts-0.1.0.tgz',
      tarball_sha256: '79745ee0ac9d8adf9272760d9c1203cf6f2e8c01669ea3081d2838db76738194',
      integrity:
        'sha512-FXZZJS39EbDqyFlXsLQ1QKW4P58zNwUJXoDoCd8QfHstpY5hMrG6xQccrqFs+Ifyl5/CFBTO4lqEMBi52mG7sA==',
      source_manifest_sha256: 'bb6d62b0b70ea3833cc55cd804b70619386a4853cb2ca37b7f24d2f35b1736ee',
      files: Object.freeze([
        'README.md',
        'dist/command-result.d.ts',
        'dist/command-result.js',
        'dist/index.d.ts',
        'dist/index.js',
        'package.json',
      ]),
    }),
    Object.freeze({
      name: '@stymobile/core',
      version: '0.1.0',
      file: 'stymobile-core-0.1.0.tgz',
      tarball_sha256: 'daa7a7dc4e2bd60e251bba6bc9f1e284b939c77ec3c715690ced92cfcd551b2b',
      integrity:
        'sha512-StrUUyaoHCTblQ73bwazeZSxAzi3uBa6E0Fysyz+k7WlubI8sqbdBFdYwKaQNRaUomjDArtW0N7sR0l21XqbkQ==',
      source_manifest_sha256: '3928ae3308e90084c3e60a73d55bc27d3a1c83bc728cf87caa2c70de91753492',
      files: Object.freeze([
        'README.md',
        'dist/account-scope.d.ts',
        'dist/account-scope.js',
        'dist/entity-revision.d.ts',
        'dist/entity-revision.js',
        'dist/index.d.ts',
        'dist/index.js',
        'dist/scoped-command.d.ts',
        'dist/scoped-command.js',
        'dist/scoped-read.d.ts',
        'dist/scoped-read.js',
        'package.json',
      ]),
    }),
  ]),
});

const sensitiveArtifactPath =
  /(^|\/)(?:\.env(?:\..*)?|credentials\.json|[^/]+\.(?:p8|p12|pfx|pem|key|jks|keystore|mobileprovision|provisionprofile|cer))$/i;
const prohibitedArtifactPath = /(^|\/)(?:tests?|src|signing)(\/|$)|(^|\/)\.tsbuildinfo$/i;
const errorIdentifiers = new Set([
  'artifact_dependency_mismatch',
  'artifact_file_list_mismatch',
  'artifact_manifest_invalid',
  'artifact_manifest_mismatch',
  'artifact_must_be_regular_file',
  'artifact_path_invalid',
  'artifact_prohibited_path',
  'artifact_sensitive_path',
  'artifact_tar_invalid',
  'isolated_consumer_failed',
  'lockfile_dependency_mismatch',
  'lockfile_integrity_mismatch',
  'lockfile_invalid',
  'lockfile_package_mismatch',
  'lockfile_resolution_mismatch',
  'package_list_mismatch',
  'package_manifest_invalid',
  'package_resolution_mismatch',
  'provenance_invalid',
  'provenance_mismatch',
  'provenance_path_invalid',
  'repository_manifest_must_be_regular_file',
  'repository_root_invalid',
  'schema_version_mismatch',
  'source_commit_mismatch',
  'source_manifest_mismatch',
  'source_repository_mismatch',
  'tarball_integrity_mismatch',
  'tarball_sha256_mismatch',
  'third_stymobile_package',
  'toolchain_mismatch',
  'vendor_verification_failed',
]);

function fail(identifier) {
  throw new Error(identifier);
}

function isBeneath(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== '' && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

async function requireRegularFile(path, identifier = 'artifact_must_be_regular_file') {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink() || !status.isFile()) fail(identifier);
  } catch (error) {
    if (error instanceof Error && error.message === identifier) throw error;
    fail(identifier);
  }
}

async function readJson(path, identifier) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    fail(identifier);
  }
}

function bytewiseSort(paths) {
  return [...paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

async function runFile(command, args, options, identifier) {
  try {
    return await execFileAsync(command, args, { ...options, shell: false });
  } catch {
    fail(identifier);
  }
}

function assertSafeArtifactPath(path) {
  if (
    isAbsolute(path) ||
    /^[A-Za-z]:[\\/]/u.test(path) ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..' || segment === '' || segment === '.')
  ) {
    fail('artifact_path_invalid');
  }
  if (sensitiveArtifactPath.test(path)) fail('artifact_sensitive_path');
  if (prohibitedArtifactPath.test(path)) fail('artifact_prohibited_path');
}

function assertExactProvenance(provenance) {
  if (provenance?.schema_version !== 1) fail('schema_version_mismatch');
  if (provenance?.source?.repository !== EXPECTED_PROVENANCE.source.repository) {
    fail('source_repository_mismatch');
  }
  if (provenance?.source?.commit !== EXPECTED_SOURCE_COMMIT) fail('source_commit_mismatch');
  if (!isDeepStrictEqual(provenance?.toolchain, EXPECTED_PROVENANCE.toolchain)) {
    fail('toolchain_mismatch');
  }
  if (
    !Array.isArray(provenance?.packages) ||
    !isDeepStrictEqual(
      provenance.packages.map((entry) => entry?.name),
      EXPECTED_PACKAGE_NAMES,
    )
  ) {
    fail('package_list_mismatch');
  }
  if (!isDeepStrictEqual(provenance, EXPECTED_PROVENANCE)) fail('provenance_mismatch');
}

async function verifyTarball(packageRecord, tarballPath) {
  const bytes = await readFile(tarballPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== packageRecord.tarball_sha256) fail('tarball_sha256_mismatch');
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (integrity !== packageRecord.integrity) fail('tarball_integrity_mismatch');

  const { stdout: listing } = await runFile(
    'tar',
    ['-tzf', tarballPath],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    'artifact_tar_invalid',
  );
  const paths = listing.split(/\r?\n/u).filter(Boolean).map((archivePath) => {
    if (!archivePath.startsWith('package/')) fail('artifact_path_invalid');
    const normalized = archivePath.slice('package/'.length);
    assertSafeArtifactPath(normalized);
    return normalized;
  });
  if (!isDeepStrictEqual(bytewiseSort(paths), packageRecord.files)) {
    fail('artifact_file_list_mismatch');
  }

  const { stdout: sourceManifest } = await runFile(
    'tar',
    ['-xOf', tarballPath, 'package/package.json'],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 },
    'artifact_manifest_invalid',
  );
  if (createHash('sha256').update(sourceManifest).digest('hex') !== packageRecord.source_manifest_sha256) {
    fail('source_manifest_mismatch');
  }

  let packageManifest;
  try {
    packageManifest = JSON.parse(sourceManifest.toString('utf8'));
  } catch {
    fail('artifact_manifest_invalid');
  }
  if (
    packageManifest.name !== packageRecord.name ||
    packageManifest.version !== packageRecord.version ||
    packageManifest.private !== true ||
    packageManifest.license !== 'UNLICENSED'
  ) {
    fail('artifact_manifest_mismatch');
  }
  if (packageRecord.name === '@stymobile/core') {
    if (!isDeepStrictEqual(packageManifest.dependencies, { '@stymobile/contracts': '0.1.0' })) {
      fail('artifact_dependency_mismatch');
    }
  } else if (packageManifest.dependencies !== undefined) {
    fail('artifact_dependency_mismatch');
  }
}

function assertNoThirdStymobilePackage(packageManifest, lockfile) {
  const allowed = new Set(EXPECTED_PACKAGE_NAMES);
  const manifestNames = Object.keys(packageManifest.dependencies ?? {}).filter((name) => name.startsWith('@stymobile/'));
  const installedNames = Object.keys(lockfile.packages ?? {})
    .filter((path) => path.startsWith('node_modules/@stymobile/'))
    .map((path) => path.slice('node_modules/'.length));
  if ([...manifestNames, ...installedNames].some((name) => !allowed.has(name))) {
    fail('third_stymobile_package');
  }
}

function verifyRepositoryManifests(packageManifest, lockfile) {
  const expectedDependencies = Object.fromEntries(
    EXPECTED_PROVENANCE.packages.map((record) => [record.name, `file:${VENDOR_DIRECTORY}/${record.file}`]),
  );
  for (const [name, expectedResolution] of Object.entries(expectedDependencies)) {
    if (packageManifest.dependencies?.[name] !== expectedResolution) fail('package_resolution_mismatch');
    if (lockfile.packages?.['']?.dependencies?.[name] !== expectedResolution) {
      fail('lockfile_resolution_mismatch');
    }
    const installed = lockfile.packages?.[`node_modules/${name}`];
    const expectedRecord = EXPECTED_PROVENANCE.packages.find((record) => record.name === name);
    if (installed?.version !== '0.1.0' || installed?.resolved !== expectedResolution) {
      fail('lockfile_resolution_mismatch');
    }
    if (installed.integrity !== expectedRecord.integrity) fail('lockfile_integrity_mismatch');
    const expectedInstalled = {
      version: '0.1.0',
      resolved: expectedResolution,
      integrity: expectedRecord.integrity,
      license: 'UNLICENSED',
      ...(name === '@stymobile/core'
        ? { dependencies: { '@stymobile/contracts': '0.1.0' } }
        : {}),
    };
    if (
      name === '@stymobile/core' &&
      !isDeepStrictEqual(installed.dependencies, expectedInstalled.dependencies)
    ) {
      fail('lockfile_dependency_mismatch');
    }
    if (!isDeepStrictEqual(installed, expectedInstalled)) fail('lockfile_package_mismatch');
  }
  if (
    packageManifest.engines?.node !== '22.x' ||
    packageManifest.engines?.npm !== '11.12.1' ||
    lockfile.packages?.['']?.engines?.node !== '22.x' ||
    lockfile.packages?.['']?.engines?.npm !== '11.12.1'
  ) {
    fail('toolchain_mismatch');
  }
  assertNoThirdStymobilePackage(packageManifest, lockfile);
}

function isolatedEnvironment(consumerRoot) {
  const environment = {};
  for (const name of ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC']) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  environment.npm_config_cache = join(consumerRoot, 'npm-cache');
  environment.npm_config_offline = 'true';
  environment.npm_config_userconfig = join(consumerRoot, '.npmrc');
  environment.npm_config_globalconfig = join(consumerRoot, '.npmrc-global');
  return environment;
}

async function verifyInstalledPath(consumerRoot, packageName) {
  const installedPath = await realpath(join(consumerRoot, 'node_modules', ...packageName.split('/')));
  if (!isBeneath(consumerRoot, installedPath)) fail('isolated_consumer_failed');
}

async function verifyIsolatedConsumer(repositoryRoot, tarballPaths) {
  const consumerRoot = await mkdtemp(join(tmpdir(), 'stylee-stymobile-consumer-'));
  try {
    const consumerRealRoot = await realpath(consumerRoot);
    await writeFile(join(consumerRoot, 'package.json'), '{"name":"stymobile-consumer","private":true,"type":"module"}\n');
    await writeFile(join(consumerRoot, '.npmrc'), '');
    await writeFile(join(consumerRoot, '.npmrc-global'), '');
    const environment = isolatedEnvironment(consumerRoot);
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await runFile(
      npmCommand,
      ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballPaths],
      { cwd: consumerRoot, env: environment, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      'isolated_consumer_failed',
    );
    await Promise.all(EXPECTED_PACKAGE_NAMES.map((name) => verifyInstalledPath(consumerRealRoot, name)));

    const runtimeProbe = join(consumerRoot, 'runtime-probe.mjs');
    await writeFile(
      runtimeProbe,
      [
        "import { createAccountScope, runScopedRead } from '@stymobile/core';",
        "const scope = createAccountScope();",
        "scope.replaceAccount('web-consumer');",
        'const stamp = scope.capture();',
        "if (!stamp) throw new Error('probe_failed');",
        'let applied;',
        'const outcome = await runScopedRead({',
        '  scope,',
        '  stamp,',
        '  execute: async ({ accountId }) => ({ accountId, value: 42 }),',
        '  apply: (value) => { applied = value; },',
        '});',
        "if (outcome.kind !== 'committed' || applied?.accountId !== 'web-consumer' || applied?.value !== 42) {",
        "  throw new Error('probe_failed');",
        '}',
        '',
      ].join('\n'),
    );
    await runFile(
      process.execPath,
      [runtimeProbe],
      { cwd: consumerRoot, env: environment, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      'isolated_consumer_failed',
    );

    const typeProbe = join(consumerRoot, 'type-probe.ts');
    await writeFile(
      typeProbe,
      [
        "import { commandRecovery, type AccountId, type CommandResult } from '@stymobile/contracts';",
        'import {',
        '  chooseEntityVersion,',
        '  createAccountScope,',
        '  runScopedCommand,',
        '  runScopedRead,',
        '  type AccountScope,',
        '  type AccountScopeState,',
        '  type AccountStamp,',
        '  type EntityDecision,',
        '  type EntityKey,',
        '  type RevisionedEntity,',
        '  type ScopeResetter,',
        '  type ScopeTransition,',
        '  type ScopedCommandOptions,',
        '  type ScopedCommandOutcome,',
        '  type ScopedReadFailureReason,',
        '  type ScopedReadOptions,',
        '  type ScopedReadOutcome,',
        "} from '@stymobile/core';",
        "const accountId = 'web-consumer' as AccountId;",
        'const resetter: ScopeResetter = () => undefined;',
        'const scope: AccountScope = createAccountScope([resetter]);',
        'const transition: ScopeTransition = scope.replaceAccount(accountId);',
        'const state: AccountScopeState = transition.state;',
        'const stamp: AccountStamp | null = scope.capture();',
        'const result: CommandResult<number> = {',
        '  schema_version: 1,',
        '  operation_id: "operation",',
        '  request_id: "request",',
        '  server_time: "1970-01-01T00:00:00.000Z",',
        '  state: "pending",',
        '  result: null,',
        '  error: null,',
        '};',
        'commandRecovery(result);',
        'const key: EntityKey = { ownerId: accountId, entityId: "entity" };',
        'const entity: RevisionedEntity<number> = { ...key, revision: 1, value: 42 };',
        'const decision: EntityDecision<number> = chooseEntityVersion(key, null, entity);',
        'const readOptions = {} as ScopedReadOptions<number>;',
        'const readOutcome: Promise<ScopedReadOutcome> = runScopedRead(readOptions);',
        'const commandOptions = {} as ScopedCommandOptions<number>;',
        'const commandOutcome: Promise<ScopedCommandOutcome> = runScopedCommand(commandOptions);',
        'const reason: ScopedReadFailureReason = "execute_failed";',
        'void [state, stamp, decision, readOutcome, commandOutcome, reason];',
        '',
      ].join('\n'),
    );
    const typescriptCompiler = resolve(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    await requireRegularFile(typescriptCompiler, 'isolated_consumer_failed');
    await runFile(
      process.execPath,
      [
        typescriptCompiler,
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        'false',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        typeProbe,
      ],
      { cwd: consumerRoot, env: environment, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
      'isolated_consumer_failed',
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'isolated_consumer_failed') throw error;
    fail('isolated_consumer_failed');
  } finally {
    await rm(consumerRoot, { recursive: true, force: true });
  }
}

async function verifyStymobileVendorInternal({ repositoryRoot, runConsumer }) {
  let root;
  try {
    root = await realpath(repositoryRoot);
  } catch {
    fail('repository_root_invalid');
  }

  const provenancePath = resolve(root, VENDOR_DIRECTORY, 'provenance.json');
  if (!isBeneath(root, provenancePath)) fail('provenance_path_invalid');
  await requireRegularFile(provenancePath);
  if (!isBeneath(root, await realpath(provenancePath))) fail('provenance_path_invalid');

  const provenance = await readJson(provenancePath, 'provenance_invalid');
  assertExactProvenance(provenance);

  const tarballPaths = provenance.packages.map((packageRecord) =>
    resolve(dirname(provenancePath), packageRecord.file),
  );
  for (let index = 0; index < tarballPaths.length; index += 1) {
    const tarballPath = tarballPaths[index];
    if (!isBeneath(root, tarballPath)) fail('artifact_path_invalid');
    await requireRegularFile(tarballPath);
    if (!isBeneath(root, await realpath(tarballPath))) fail('artifact_path_invalid');
    await verifyTarball(provenance.packages[index], tarballPath);
  }

  const packagePath = resolve(root, 'package.json');
  const lockfilePath = resolve(root, 'package-lock.json');
  await requireRegularFile(packagePath, 'repository_manifest_must_be_regular_file');
  await requireRegularFile(lockfilePath, 'repository_manifest_must_be_regular_file');
  const [packageManifest, lockfile] = await Promise.all([
    readJson(packagePath, 'package_manifest_invalid'),
    readJson(lockfilePath, 'lockfile_invalid'),
  ]);
  verifyRepositoryManifests(packageManifest, lockfile);

  if (runConsumer) await verifyIsolatedConsumer(root, tarballPaths);

  return Object.freeze({
    sourceCommit: EXPECTED_SOURCE_COMMIT,
    packages: EXPECTED_PACKAGE_NAMES,
  });
}

export async function verifyStymobileVendor({ repositoryRoot, runConsumer = true }) {
  try {
    return await verifyStymobileVendorInternal({ repositoryRoot, runConsumer });
  } catch (error) {
    if (error instanceof Error && errorIdentifiers.has(error.message)) throw error;
    fail('vendor_verification_failed');
  }
}
